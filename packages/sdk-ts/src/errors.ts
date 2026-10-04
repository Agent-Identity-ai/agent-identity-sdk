

interface WireError {
  code?: string;
  message?: string;
  request_id?: string;
  retryable?: boolean;
}

function unwrapWireError(body: unknown): WireError | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  if ("error" in body) return (body as { error: WireError }).error;
  return body as WireError;
}

/** The API returned a non-2xx response. Carries the server's own error fields. */
export class AidApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly retryable: boolean;

  constructor(status: number, body: unknown) {
    const wire = unwrapWireError(body);
    super(wire?.message ?? `request failed with status ${status}`);
    this.name = "AidApiError";
    this.status = status;
    this.code = wire?.code ?? "unknown";
    this.requestId = wire?.request_id ?? "";
    this.retryable = wire?.retryable ?? false;
  }
}

/**
 * The request never reached the API — DNS failure, connection refused, TLS error, or the
 * request deadline elapsing.
 *
 * Without this, these surface as `TypeError: fetch failed`, which names neither the URL nor the
 * underlying problem (undici hides it on `.cause`). Distinguishing "the server said no" from
 * "I never reached the server" is the difference between fixing your request and checking your
 * network, so the two cases get distinct types.
 */
export class AidConnectionError extends Error {
  /** The originating error, e.g. an undici `ECONNREFUSED`/`ENOTFOUND`, or a timeout abort. */
  override readonly cause: unknown;
  readonly method: string;
  readonly url: string;
  /** True when the client's own deadline elapsed rather than the connection failing outright. */
  readonly timedOut: boolean;

  constructor(method: string, url: string, cause: unknown, timedOut: boolean) {
    const detail =
      cause instanceof Error && cause.cause instanceof Error
        ? cause.cause.message
        : cause instanceof Error
          ? cause.message
          : String(cause);
    super(
      timedOut
        ? `${method} ${url} timed out before the API responded`
        : `${method} ${url} could not reach the API: ${detail}`,
    );
    this.name = "AidConnectionError";
    this.cause = cause;
    this.method = method;
    this.url = url;
    this.timedOut = timedOut;
  }
}
