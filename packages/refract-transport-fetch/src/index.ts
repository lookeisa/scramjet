import {
  RefractError,
  defaultRefractLogger,
  type RefractLogger,
  type RefractRequest,
  type RefractResponse,
} from "@refractjs/refract-shared";
import { BaseTransport } from "@refractjs/refract-transports";

export interface FetchTransportOptions {
  allowedOrigins: string[];
  allowLoopback?: boolean;
  allowPrivateNetwork?: boolean;
  maxRequestBytes?: number;
  maxUploadBytes?: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
  logger?: RefractLogger;
}

function normalizedHostname(hostname: string): string {
	return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isLoopback(hostname: string): boolean {
  const host = normalizedHostname(hostname);
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || host.startsWith("127.");
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 10 || first === 127 || first === 0 ||
    (first === 169 && second === 254) ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 168);
}

function isPrivateIpv6(hostname: string): boolean {
	const host = normalizedHostname(hostname);
	return host === "::" || /^(?:fc|fd|fe[89ab]|fec0)/i.test(host) ||
		/^::ffff:(?:7f|a|c0a8|ac1[0-9a-f]|a9fe):/i.test(host);
}

function validateLiteralHost(url: URL, allowLoopback: boolean, allowPrivateNetwork: boolean): void {
  const loopback = isLoopback(url.hostname);
  if (loopback && !allowLoopback) {
    throw new RefractError("REFRACT_E_ORIGIN_NOT_ALLOWED", "Loopback destinations are disabled");
  }
  if (!allowPrivateNetwork && !loopback && isPrivateIpv4(url.hostname)) {
    throw new RefractError("REFRACT_E_ORIGIN_NOT_ALLOWED", "Private network destinations are disabled");
  }
  if (!allowPrivateNetwork && !loopback && isPrivateIpv6(url.hostname)) {
    throw new RefractError("REFRACT_E_ORIGIN_NOT_ALLOWED", "Private IPv6 destinations are disabled");
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new RefractError("REFRACT_E_TRANSPORT", "Response exceeds the configured byte limit");
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RefractError("REFRACT_E_TRANSPORT", "Response exceeds the configured byte limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export class FetchTransport extends BaseTransport {
  private readonly allowedOrigins: Set<string>;
  private readonly fetchImpl: typeof fetch;
  private readonly allowLoopback: boolean;
  private readonly allowPrivateNetwork: boolean;
  private readonly maxRequestBytes: number;
  private readonly maxUploadBytes: number;
  private readonly maxResponseBytes: number;

  constructor(options: FetchTransportOptions) {
    super("fetch", options.logger ?? defaultRefractLogger);
    try {
		this.allowedOrigins = new Set(options.allowedOrigins.map((value) => {
			const url = new URL(value);
			if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported scheme");
			return url.origin;
		}));
	} catch (error) {
		throw new RefractError("REFRACT_E_CONFIG", "Allowed origins must be absolute HTTP(S) origins", { cause: error });
	}
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.allowLoopback = options.allowLoopback ?? false;
    this.allowPrivateNetwork = options.allowPrivateNetwork ?? false;
    this.maxRequestBytes = options.maxRequestBytes ?? 25 * 1024 * 1024;
    this.maxUploadBytes = options.maxUploadBytes ?? 10 * 1024 * 1024;
    this.maxResponseBytes = options.maxResponseBytes ?? 25 * 1024 * 1024;
  }

  override async request(request: RefractRequest): Promise<RefractResponse> {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch (error) {
      throw new RefractError("REFRACT_E_INVALID_URL", "Request URL must be absolute", { cause: error });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new RefractError("REFRACT_E_INVALID_URL", "Only HTTP and HTTPS URLs are supported");
    }
    if (url.username || url.password) {
      throw new RefractError("REFRACT_E_INVALID_URL", "URL credentials are not accepted");
    }
    if (!this.allowedOrigins.has(url.origin)) {
      throw new RefractError("REFRACT_E_ORIGIN_NOT_ALLOWED", `Origin ${url.origin} is not allowlisted`);
    }
    validateLiteralHost(url, this.allowLoopback, this.allowPrivateNetwork);

    const body = request.body ?? undefined;
    const bodyBytes = typeof body === "string" ? new TextEncoder().encode(body).byteLength : body?.byteLength ?? 0;
    if (bodyBytes > this.maxUploadBytes) {
      throw new RefractError("REFRACT_E_TRANSPORT", "Upload exceeds the configured byte limit");
    }
    const method = request.method.toUpperCase();
    const requestSize = new TextEncoder().encode(
    `${method}\n${url.href}\n${JSON.stringify(request.headers ?? {})}`
  ).byteLength + bodyBytes;
  if (requestSize > this.maxRequestBytes) {
    throw new RefractError("REFRACT_E_TRANSPORT", "Request exceeds the configured byte limit");
  }
    if ((method === "GET" || method === "HEAD") && bodyBytes > 0) {
      throw new RefractError("REFRACT_E_TRANSPORT", `${method} requests cannot include a body`);
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = request.timeoutMs && request.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, request.timeoutMs)
      : undefined;
    const onAbort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", onAbort, { once: true });
    if (request.signal?.aborted) onAbort();

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: request.headers,
        body: body === undefined ? undefined : typeof body === "string" ? body : Uint8Array.from(body).buffer,
        signal: controller.signal,
        redirect: "manual",
      });
      const bytes = await readBounded(response, this.maxResponseBytes);
      const result: RefractResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: bytes,
        ok: response.ok,
      };
      this.accountRequest(request, result);
      return result;
    } catch (error) {
      if (timedOut) throw new RefractError("REFRACT_E_TIMEOUT", "Request timed out", { cause: error });
      if (request.signal?.aborted) throw new RefractError("REFRACT_E_ABORTED", "Request was aborted", { cause: error });
      if (error instanceof RefractError) throw error;
      this.markError(error instanceof Error ? error.message : String(error));
      throw new RefractError("REFRACT_E_TRANSPORT", "Fetch request failed", { cause: error });
    } finally {
      if (timeout) clearTimeout(timeout);
      request.signal?.removeEventListener("abort", onAbort);
    }
  }
}
