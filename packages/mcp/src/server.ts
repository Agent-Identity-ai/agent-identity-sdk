import {
  A2ARemoteClient,
  AidApiError,
  jsonRpcInterfaceOf,
  type A2ATask,
  type A2ATaskListing,
  type AgentClient,
  type RemotePart,
  type RemoteTask,
} from "@agentidentity/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface AidMcpOptions {
  /** A client holding an **agent** key: every tool acts as that one agent, and as no one else. */
  client: AgentClient;
  /**
   * Credentials for other vendors' A2A agents, by origin: `{"https://a2a.example.com": "key"}`. They are
   * kept here, out of what the model sees, and sent only to the origin they belong to.
   */
  remoteKeys?: Record<string, string>;
  /** Replace `fetch` for calls to other vendors' agents, for tests. */
  fetch?: typeof fetch;
  name?: string;
  version?: string;
}

type Content = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const ok = (value: unknown): Content => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

const fail = (message: string): Content => ({ content: [{ type: "text", text: message }], isError: true });

function textOf(parts: Array<{ text: string } | { data: unknown }>): string {
  return parts.map((part) => ("text" in part ? part.text : JSON.stringify(part.data))).join("\n");
}

function remotePartText(part: RemotePart): string {
  if (part.text !== undefined) return part.text;
  if (part.data !== undefined) return JSON.stringify(part.data);
  if (part.url !== undefined) return part.url;
  return part.filename ? `[file ${part.filename}]` : "[binary content]";
}

/** A task as the model needs it: who, what state, and the conversation, without ids it cannot use. */
function summarizeTask(task: A2ATask | A2ATaskListing) {
  return {
    task_id: task.id,
    conversation_id: task.contextId,
    state: task.state,
    from: "callerHandle" in task ? `@${task.callerHandle}` : task.callerIdentityId,
    to: "targetHandle" in task ? `@${task.targetHandle}` : task.targetIdentityId,
    updated_at: task.updatedAt,
    ...("messages" in task && task.messages
      ? { messages: task.messages.map((message) => ({ from: message.role, text: textOf(message.parts) })) }
      : { request: task.message, ...(task.result !== null ? { result: task.result } : {}) }),
  };
}

function summarizeRemoteTask(task: RemoteTask) {
  return {
    task_id: task.id,
    conversation_id: task.contextId ?? null,
    state: task.status.state.replace("TASK_STATE_", "").toLowerCase(),
    agent_said: task.status.message ? task.status.message.parts.map(remotePartText).join("\n") : null,
    results: (task.artifacts ?? []).map((artifact) => ({
      name: artifact.name ?? null,
      text: artifact.parts.map(remotePartText).join("\n"),
    })),
  };
}

const RULE_HELP =
  "If it is refused (403), the other agent is not reachable by this one: they may be private, or a block rule may apply. Do not retry; tell the user.";

/**
 * Builds the MCP server. It is a thin layer over the SDK: each tool is one SDK call with its answer trimmed to what a
 * model can act on, and any API error is returned as a tool error carrying the server's own explanation.
 */
export function createAidMcpServer(options: AidMcpOptions): McpServer {
  const { client } = options;
  const server = new McpServer({ name: options.name ?? "agent-identity", version: options.version ?? "0.0.0" });

  const remote = new A2ARemoteClient({
    apiKey: (origin) => options.remoteKeys?.[origin],
    ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
  });

  function tool<Shape extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: Shape,
    handler: (args: z.infer<z.ZodObject<Shape>>) => Promise<unknown>,
    hints: { readOnly?: boolean; destructive?: boolean; openWorld?: boolean } = {},
  ): void {
    server.registerTool(
      name,
      {
        description,
        inputSchema: shape,
        annotations: {
          readOnlyHint: hints.readOnly ?? false,
          destructiveHint: hints.destructive ?? false,
          idempotentHint: hints.readOnly ?? false,
          openWorldHint: hints.openWorld ?? false,
        },
      },
      (async (args: z.infer<z.ZodObject<Shape>>) => {
        try {
          return ok(await handler(args));
        } catch (error) {
          if (error instanceof AidApiError) return fail(`${error.message} (HTTP ${error.status})`);
          return fail(error instanceof Error ? error.message : String(error));
        }
      }) as never,
    );
  }

  tool(
    "a2a_send_task",
    `Send a task to another agent by its handle and get back the task. Use conversation_id to continue an earlier conversation with the same agent. The other agent answers later: read the answer with a2a_get_task. ${RULE_HELP}`,
    {
      to_handle: z.string().min(1).describe("The other agent's handle, with or without a leading @."),
      text: z.string().min(1).describe("What you are asking, in plain words. Include everything the agent needs."),
      conversation_id: z.string().optional().describe("Continue this conversation instead of starting one."),
      message_id: z.string().max(200).optional().describe("A stable id so a retry does not send twice."),
    },
    async (a) =>
      summarizeTask(
        await client.a2a.sendTask({
          targetHandle: a.to_handle,
          message: a.text,
          ...(a.conversation_id !== undefined ? { contextId: a.conversation_id } : {}),
          ...(a.message_id !== undefined ? { messageId: a.message_id } : {}),
        }),
      ),
  );

  tool(
    "a2a_get_task",
    "Read a task and everything said in it. State is one of submitted, working, input_required (the agent asked a question: answer with a2a_answer_question), completed, failed, canceled or rejected.",
    { task_id: z.string().min(1) },
    async (a) => summarizeTask(await client.a2a.getTask(a.task_id)),
    { readOnly: true },
  );

  tool(
    "a2a_list_tasks",
    "List your tasks, most recently changed first: the ones you sent and the ones sent to you. Use direction=inbound to find work waiting for you to do.",
    {
      direction: z.enum(["inbound", "outbound", "both"]).optional().describe("inbound: sent to you. outbound: sent by you."),
      state: z.enum(["submitted", "working", "input_required", "completed", "failed", "canceled", "rejected"]).optional(),
      q: z.string().optional().describe("Words to find anywhere in the task's messages."),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (a) => {
      const page = await client.a2a.searchTasks({
        ...(a.direction !== undefined ? { direction: a.direction } : {}),
        ...(a.state !== undefined ? { state: a.state } : {}),
        ...(a.q !== undefined ? { q: a.q } : {}),
        limit: a.limit ?? 20,
      });
      return { tasks: page.items.map(summarizeTask), more: page.nextCursor !== null };
    },
    { readOnly: true },
  );

  tool(
    "a2a_reply_to_task",
    "Answer a task that was sent to you. intent=progress says you are working on it; ask_caller asks the sender a question and waits; complete finishes it with your result; fail says you could not do it.",
    {
      task_id: z.string().min(1),
      intent: z.enum(["progress", "ask_caller", "complete", "fail"]),
      text: z.string().min(1).describe("Your update, question, result, or the reason you could not."),
      message_id: z.string().max(200).optional().describe("A stable id so a retry does not reply twice."),
    },
    async (a) =>
      summarizeTask(
        await client.a2a.replyToTask(a.task_id, {
          intent: a.intent,
          message: a.text,
          ...(a.message_id !== undefined ? { messageId: a.message_id } : {}),
        }),
      ),
  );

  tool(
    "a2a_answer_question",
    "Answer the question a task you sent is waiting on (state input_required). The other agent then carries on.",
    { task_id: z.string().min(1), text: z.string().min(1) },
    async (a) => summarizeTask(await client.a2a.appendTaskMessage(a.task_id, { message: a.text })),
  );

  tool(
    "a2a_cancel_task",
    "Withdraw a task you sent that has not finished. Repeating it is fine; a task that already finished cannot be canceled.",
    { task_id: z.string().min(1) },
    async (a) => summarizeTask(await client.a2a.cancelTask(a.task_id)),
    { destructive: true },
  );

  tool(
    "a2a_list_conversations",
    "List your conversations with other agents: each is everything you and one other agent have exchanged.",
    {},
    async () => ({
      conversations: (await client.a2a.listContexts()).map((context) => ({
        conversation_id: context.id,
        name: context.name,
        tasks: context.taskCount,
        updated_at: context.updatedAt,
      })),
    }),
    { readOnly: true },
  );

  tool(
    "a2a_get_conversation",
    "Read a whole conversation: every task in it, with all of its messages.",
    { conversation_id: z.string().min(1) },
    async (a) => {
      const context = await client.a2a.getContext(a.conversation_id);
      return { conversation_id: context.id, name: context.name, tasks: context.tasks.map(summarizeTask) };
    },
    { readOnly: true },
  );

  tool(
    "a2a_search_messages",
    "Search the individual messages across all your tasks, newest first.",
    {
      q: z.string().min(1).describe('Whole words, any case; several words means all of them; "in quotes" is a phrase.'),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (a) => {
      const page = await client.a2a.searchMessages({ q: a.q, limit: a.limit ?? 20 });
      return {
        messages: page.items.map((message) => ({
          task_id: message.taskId,
          conversation_id: message.contextId,
          from: message.role,
          between: `@${message.callerHandle} and @${message.targetHandle}`,
          at: message.createdAt,
          text: textOf(message.parts),
        })),
        more: page.nextCursor !== null,
      };
    },
    { readOnly: true },
  );

  tool(
    "a2a_find_agents",
    "Search the public directory for agents you could send a task to, by handle or skill. It lists only agents that chose to be public.",
    { q: z.string().optional(), limit: z.number().int().min(1).max(50).optional() },
    async (a) => {
      const page = await client.a2a.directory({ ...(a.q !== undefined ? { q: a.q } : {}), limit: a.limit ?? 20 });
      return { agents: page.items, more: page.nextCursor !== null };
    },
    { readOnly: true },
  );

  tool(
    "a2a_get_agent_card",
    "Read another agent's public card: what it says it can do and how to call it.",
    { handle: z.string().min(1) },
    async (a) => client.a2a.getAgentCardByHandle(a.handle),
    { readOnly: true },
  );

  tool(
    "a2a_list_rules",
    "List the rules about which agents you may receive tasks from and send tasks to.",
    {},
    async () => ({
      rules: (await client.a2a.listContactRules()).map((rule) => ({
        handle: `@${rule.handle}`,
        action: rule.action,
        direction: rule.direction,
      })),
    }),
    { readOnly: true },
  );

  tool(
    "a2a_check_remote_agent",
    "Read the card at a URL and say whether an agent on any A2A platform can be called, over what, and how it wants to be authenticated. Changes nothing.",
    { card_url: z.string().url().describe("The agent card URL, e.g. https://host/a2a/handle/card") },
    async (a) => {
      const card = await remote.fetchCard(a.card_url);
      let callable: string;
      try {
        jsonRpcInterfaceOf(card);
        callable = "yes, over JSON-RPC 1.x";
      } catch (error) {
        callable = `no: ${error instanceof Error ? error.message : String(error)}`;
      }
      return {
        name: card.name,
        description: card.description,
        callable,
        authentication: Object.keys(card.securitySchemes ?? {}),
        skills: card.skills.map((skill) => ({ id: skill.id, name: skill.name })),
      };
    },
    { readOnly: true, openWorld: true },
  );

  tool(
    "a2a_call_remote_agent",
    "Send a message to an agent on ANY A2A platform by its card URL. By default it returns at once with the task; read the answer later with a2a_get_remote_task. Use a2a_send_task instead for agents on Agent Identity. Only calls agents whose origin you were configured with credentials for, or that need none.",
    {
      card_url: z.string().url(),
      text: z.string().min(1),
      conversation_id: z.string().optional(),
      task_id: z.string().optional().describe("Continue this task, e.g. to answer a question it asked."),
      wait: z
        .boolean()
        .optional()
        .describe("Hold the call open until the agent finishes or needs something from you (up to about 30 seconds). Default false."),
    },
    async (a) => {
      const result = await remote.send(a.card_url, {
        text: a.text,
        ...(a.wait ? {} : { returnImmediately: true }),
        ...(a.conversation_id !== undefined ? { contextId: a.conversation_id } : {}),
        ...(a.task_id !== undefined ? { taskId: a.task_id } : {}),
      });
      return result.kind === "task"
        ? summarizeRemoteTask(result.task)
        : { agent_said: result.message.parts.map(remotePartText).join("\n") };
    },
    { openWorld: true },
  );

  tool(
    "a2a_get_remote_task",
    "Read a task you started on another platform's agent with a2a_call_remote_agent: its state and what the agent said or produced.",
    { card_url: z.string().url(), task_id: z.string().min(1) },
    async (a) => summarizeRemoteTask(await remote.get(a.card_url, a.task_id)),
    { readOnly: true, openWorld: true },
  );

  return server;
}
