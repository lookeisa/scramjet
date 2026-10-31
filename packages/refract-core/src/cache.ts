import { RefractError, type RefractRequest, type RefractResponse } from "@refractjs/refract-shared";

interface CacheEntry {
  response: RefractResponse;
  expiresAt: number;
  size: number;
}

export interface CacheLookup {
  response: RefractResponse;
  fresh: boolean;
}

export interface MemoryCacheOptions {
  maxBytes: number;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function directives(value: string | undefined): Map<string, string | undefined> {
  const parsed = new Map<string, string | undefined>();
  for (const part of value?.split(",") ?? []) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    parsed.set(rawName.toLowerCase(), rawValue.length ? rawValue.join("=").replace(/^"|"$/g, "") : undefined);
  }
  return parsed;
}

function cloneResponse(response: RefractResponse): RefractResponse {
  return {
    ...response,
    headers: { ...response.headers },
    body: typeof response.body === "string" ? response.body : response.body.slice(),
  };
}

function bodySize(body: string | Uint8Array): number {
  return typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.byteLength;
}

export class MemoryResponseCache {
  private readonly entries = new Map<string, CacheEntry>();
  private usedBytes = 0;
  private readonly options: MemoryCacheOptions;

  constructor(options: MemoryCacheOptions) {
    this.options = options;
    if (options.maxBytes < 0) throw new RefractError("REFRACT_E_CONFIG", "Cache size cannot be negative");
  }

  get sizeBytes(): number {
    return this.usedBytes;
  }

  lookup(key: string): CacheLookup | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { response: cloneResponse(entry.response), fresh: entry.expiresAt > Date.now() };
  }

  store(
    key: string,
    request: RefractRequest,
    response: RefractResponse,
    partitioned: boolean
  ): boolean {
    const method = request.method.toUpperCase();
    if ((method !== "GET" && method !== "HEAD") || response.status !== 200) return false;

    const cacheControl = directives(header(response.headers, "cache-control"));
    const requestControl = directives(header(request.headers ?? {}, "cache-control"));
    if (cacheControl.has("no-store") || requestControl.has("no-store")) return false;
    if (header(response.headers, "vary") || header(response.headers, "set-cookie")) return false;

    const requestHeaders = request.headers ?? {};
    const hasCredentials = Object.keys(requestHeaders).some((name) =>
      ["authorization", "cookie"].includes(name.toLowerCase())
    );
    if ((cacheControl.has("private") || hasCredentials) && !partitioned) return false;

    let lifetimeMs = 0;
    if (cacheControl.has("no-cache")) {
      lifetimeMs = 0;
    } else if (cacheControl.has("max-age")) {
      const age = Number(cacheControl.get("max-age"));
      if (!Number.isFinite(age) || age < 0) return false;
      const currentAge = Number(header(response.headers, "age") ?? 0);
      lifetimeMs = Math.max(0, age - (Number.isFinite(currentAge) ? currentAge : 0)) * 1000;
    } else {
      const expires = Date.parse(header(response.headers, "expires") ?? "");
      if (Number.isFinite(expires)) lifetimeMs = Math.max(0, expires - Date.now());
      else return false;
    }

    const cloned = cloneResponse(response);
    const size = key.length * 2 + bodySize(cloned.body) + JSON.stringify(cloned.headers).length * 2;
    if (size > this.options.maxBytes || this.options.maxBytes === 0) return false;
    this.remove(key);
    while (this.usedBytes + size > this.options.maxBytes) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) return false;
      this.remove(oldest);
    }
    this.entries.set(key, { response: cloned, expiresAt: Date.now() + lifetimeMs, size });
    this.usedBytes += size;
    return true;
  }

  revalidated(key: string, notModified: RefractResponse): RefractResponse | undefined {
    const cached = this.entries.get(key);
    if (!cached) return undefined;
    const merged = { ...cached.response.headers };
    for (const [name, value] of Object.entries(notModified.headers)) merged[name] = value;
    const response = cloneResponse({ ...cached.response, headers: merged });
    this.remove(key);
    this.store(key, { method: "GET", url: "" }, response, true);
    return response;
  }

  invalidateUrl(url: string): void {
    for (const key of this.entries.keys()) {
      if (key.includes(`\n${url}\n`)) this.remove(key);
    }
  }

  clear(): void {
    this.entries.clear();
    this.usedBytes = 0;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.usedBytes -= entry.size;
    this.entries.delete(key);
  }
}
