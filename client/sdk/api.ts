/** A small JSON client for the Blit server: unwraps `{ success, data }` and throws `ApiError` on failure. */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
  blob(path: string, init?: RequestInit): Promise<Blob>;
}

export function createApiClient(base: string): ApiClient {
  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
    if (res.ok) return res;
    const raw = await res.text().catch(() => '');
    let parsed: unknown;
    try {
      parsed = raw ? JSON.parse(raw) : undefined;
    } catch {
      parsed = raw;
    }
    const message =
      parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `Request failed (status ${res.status})`;
    throw new ApiError(message, res.status, parsed);
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await send(path, init);
    if (res.status === 204) return undefined as T;
    const raw = await res.text();
    if (!raw) return undefined as T;
    const json = JSON.parse(raw) as { success?: boolean; error?: string; data?: T };
    if (json.success === false) throw new ApiError(json.error || 'Request failed', res.status, json);
    return (json.data !== undefined ? json.data : json) as T;
  }

  const withBody = (method: string, body: unknown): RequestInit => ({
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, withBody('POST', body)),
    put: (path, body) => request(path, withBody('PUT', body)),
    patch: (path, body) => request(path, withBody('PATCH', body)),
    del: (path) => request(path, { method: 'DELETE' }),
    blob: async (path, init) => (await send(path, init)).blob(),
  };
}
