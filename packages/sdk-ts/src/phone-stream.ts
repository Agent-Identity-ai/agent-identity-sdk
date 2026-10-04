/**
 * The messages on a call's stream, between us and your agent. Your agent runs a WebSocket server; when a call is answered
 * we connect to it, and these are the JSON text frames that travel.
 *
 * Who does the speech work is chosen in your server's handshake response:
 *
 *   X-Use-AID-Speech-To-Text: false   you want the caller's audio (`media`) instead of `transcript` events
 *   X-Use-AID-Text-To-Speech: false   you will send audio (`media`) instead of `text`
 *
 * Both default to true (text mode): you only ever handle text.
 */

/** Sent by us to your agent. */
export type PhoneStreamToAgent =
  | {
      event: "start";
      stream_id: string;
      start: {
        call_control_id: string;
        stream_id: string;
        media_format: { encoding: "PCMU"; sample_rate: 8000; channels: 1 };
        /** True when we turn the caller's speech into `transcript` events. */
        speech_to_text: boolean;
        /** True when we speak the `text` you send. */
        text_to_speech: boolean;
      };
    }
  /** What the caller said. Partial results (`is_final: false`) come while they are still speaking. Text mode only. */
  | { event: "transcript"; text: string; is_final: boolean; turn_id: string }
  /** The caller talked over the agent. Stop generating the reply; what you already spoke has been cut off. */
  | { event: "barge_in"; trigger: "interim_transcript" | "final_transcript"; text: string; tts_interrupted: true; turn_id: string }
  /** The caller's audio, base64 PCMU at 8 kHz. Only when you asked for audio. */
  | { event: "media"; media: { payload: string } }
  | { event: "stop"; reason: string };

/** Sent by your agent to us. */
export type PhoneStreamFromAgent =
  /** Words to say. Send pieces with `done: false`, then a last one with `done: true`. We speak a sentence at a time. */
  | { event: "text"; delta?: string; done: boolean; turn_id?: string }
  /** Audio to play, base64 PCMU at 8 kHz. Only when you asked to send audio. */
  | { event: "media"; media: { payload: string } }
  /** Drop what is queued or being spoken. */
  | { event: "clear" }
  /** Press keys: 1 to 30 of 0-9, * and #. Anything else is ignored. */
  | { event: "dtmf"; digits: string }
  /** Hang up. */
  | { event: "stop"; reason?: string };

/** The `X-Call-Context` header on our connection to your agent, as JSON. */
export interface PhoneCallContext {
  call_id: string;
  /** The agent's own number. */
  phone_number: string | null;
  direction: "inbound" | "outbound";
  contacts: { id: string; name: string | null; memories: string[]; memories_truncated: boolean }[];
}
