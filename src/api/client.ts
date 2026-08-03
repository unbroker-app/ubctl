/**
 * Thin typed wrapper over the Unbroker REST API. Sends the API token as
 * `X-API-Key` and the optional org as `X-Org-Id`, and maps the API's
 * `{ error: { code, message } }` envelope onto a thrown {@link ApiError}.
 */

export interface ApiClientOptions {
  apiUrl: string;
  token?: string;
  org?: string;
  /** Injected for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

/** A non-2xx response from the API (or a transport failure). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string } | string;
  code?: string;
  message?: string;
  statusCode?: number;
}

export class ApiClient {
  private readonly apiUrl: string;
  private readonly token: string | undefined;
  private readonly org: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.apiUrl = opts.apiUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.org = opts.org;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.token) headers["X-API-Key"] = this.token;
    if (this.org) headers["X-Org-Id"] = this.org;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await this.fetchFn(`${this.apiUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // DNS/connection failures never reach an HTTP status.
      const detail = err instanceof Error ? err.message : String(err);
      throw new ApiError(0, "network_error", `cannot reach ${this.apiUrl}: ${detail}`);
    }

    // 204 No Content (and other empty bodies) — nothing to parse.
    const text = await res.text();
    const data: unknown = text ? safeJson(text) : undefined;

    if (!res.ok) {
      const env = (data ?? {}) as ErrorEnvelope;
      const nested =
        typeof env.error === "object" && env.error !== null
          ? env.error
          : undefined;
      throw new ApiError(
        res.status,
        nested?.code ?? env.code ?? `http_${env.statusCode ?? res.status}`,
        nested?.message ??
          env.message ??
          (typeof env.error === "string" ? env.error : undefined) ??
          res.statusText ??
          `request failed (${res.status})`,
      );
    }

    return data as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
