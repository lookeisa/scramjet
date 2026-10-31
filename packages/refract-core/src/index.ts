import {
  defaultRefractConfig,
  defaultRefractLogger,
  RefractError,
  type RefractConfig,
  type RefractLogger,
  type RefractRequest,
  type RefractResponse,
} from "@refractjs/refract-shared";
import type { RefractTransport } from "@refractjs/refract-transports";
import { FetchTransport } from "@refractjs/refract-transport-fetch";
import { RefractRewriter } from "@refractjs/refract-rewriter";
import { MemoryResponseCache } from "./cache.ts";
import { RequestScheduler } from "./scheduler.ts";

export { defaultRefractConfig } from "@refractjs/refract-shared";
export { RefractError } from "@refractjs/refract-shared";
export type {
  RefractConfig,
  RefractCacheConfig,
  RefractLogger,
  RefractRequest,
  RefractResponse,
  RefractRewriterConfig,
  RefractSchedulerConfig,
  RefractSecurityConfig,
  RefractTransportConfig,
} from "@refractjs/refract-shared";
export { MemoryResponseCache } from "./cache.ts";
export { RequestScheduler } from "./scheduler.ts";

export interface RefractRuntime {
  name: string;
  config: RefractConfig;
  logger: RefractLogger;
  metrics: {
    refract_requests_total: number;
    refract_cache_hits_total: number;
    refract_request_failures_total: number;
  };
  request(input: RefractRequest): Promise<RefractResponse>;
  close(): Promise<void>;
}

export interface CreateRefractRuntimeOptions {
  name?: string;
  logger?: RefractLogger;
  config?: {
    [K in keyof RefractConfig]?: Partial<RefractConfig[K]>;
  };
  transport?: RefractTransport;
  cache?: MemoryResponseCache;
}

function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function copyResponse(response: RefractResponse): RefractResponse {
  return {
    ...response,
    headers: { ...response.headers },
    body: typeof response.body === "string" ? response.body : response.body.slice(),
  };
}

function cacheKey(request: RefractRequest, url: URL): string {
  const headers = Object.entries(request.headers ?? {})
    .filter(([name]) => !["if-none-match", "if-modified-since", "cache-control"].includes(name.toLowerCase()))
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return `${request.cachePartition ?? "public"}\n${request.method.toUpperCase()}\n${url.href}\n${JSON.stringify(headers)}`;
}

function hasRequestCredentials(request: RefractRequest): boolean {
  return Object.keys(request.headers ?? {}).some((name) =>
    ["authorization", "cookie"].includes(name.toLowerCase())
  );
}

export function createRefractRuntime(
  options: CreateRefractRuntimeOptions = {}
): RefractRuntime {
  const logger = options.logger ?? defaultRefractLogger;
  const config: RefractConfig = {
    transport: { ...defaultRefractConfig.transport, ...options.config?.transport },
    rewriter: { ...defaultRefractConfig.rewriter, ...options.config?.rewriter },
    scheduler: { ...defaultRefractConfig.scheduler, ...options.config?.scheduler },
    cache: { ...defaultRefractConfig.cache, ...options.config?.cache },
    security: { ...defaultRefractConfig.security, ...options.config?.security },
  };
  const transport = options.transport ?? new FetchTransport({
    allowedOrigins: config.security.allowedOrigins,
    allowLoopback: config.security.allowLoopback,
    allowPrivateNetwork: config.security.allowPrivateNetwork,
    maxRequestBytes: config.security.maxRequestBytes,
    maxUploadBytes: config.security.maxUploadBytes,
    maxResponseBytes: config.security.maxResponseBytes,
    logger,
  });
  const scheduler = new RequestScheduler(config.scheduler);
  const cache = options.cache ?? new MemoryResponseCache({ maxBytes: config.cache.maxMemoryBytes });
  const rewriter = new RefractRewriter();
  const inFlight = new Map<string, Promise<RefractResponse>>();
  let connected: Promise<void> | undefined;
  let closed = false;

  const runtime: RefractRuntime = {
    name: options.name ?? "refract-runtime",
    config,
    logger,
    metrics: {
      refract_requests_total: 0,
      refract_cache_hits_total: 0,
      refract_request_failures_total: 0,
    },
    async request(input) {
      if (closed) throw new RefractError("REFRACT_E_CLOSED", "Runtime is closed");
      runtime.metrics.refract_requests_total += 1;
      let url: URL;
      try {
        url = new URL(rewriter.resolveUrl(input.url, input.baseUrl));
        url.hash = "";
      } catch (error) {
        throw new RefractError("REFRACT_E_INVALID_URL", "Request URL must be absolute", { cause: error });
      }
      if (!config.security.allowedOrigins.includes(url.origin)) {
        throw new RefractError("REFRACT_E_ORIGIN_NOT_ALLOWED", `Origin ${url.origin} is not allowlisted`);
      }

      const request: RefractRequest = { ...input, url: url.href };
      const method = request.method.toUpperCase();
      const cacheable = method === "GET" || method === "HEAD";
      const key = cacheable ? cacheKey(request, url) : "";
      const requestControl = getHeader(request.headers ?? {}, "cache-control") ?? "";
      const bypassCache = /(?:^|,)\s*no-store\b/i.test(requestControl);
      const deduplicate = cacheable && !request.signal && !hasRequestCredentials(request) && !bypassCache;
      if (deduplicate) {
        const existing = inFlight.get(key);
        if (existing) return copyResponse(await existing);
      }

      const task = scheduler.schedule(url.origin, request.priority ?? 0, request.signal, async () => {
        connected ??= transport.connect();
        await connected;
        const cached = !bypassCache && cacheable ? cache.lookup(key) : undefined;
        if (cached?.fresh && !/(?:^|,)\s*no-cache\b/i.test(requestControl)) {
          runtime.metrics.refract_cache_hits_total += 1;
          return cached.response;
        }

        const headers = { ...(request.headers ?? {}) };
        if (cached) {
          if (!getHeader(headers, "if-none-match")) {
            const etag = getHeader(cached.response.headers, "etag");
            if (etag) headers["If-None-Match"] = etag;
          }
          if (!getHeader(headers, "if-modified-since")) {
            const modified = getHeader(cached.response.headers, "last-modified");
            if (modified) headers["If-Modified-Since"] = modified;
          }
        }

        const response = await transport.request({ ...request, headers });
        if (response.status === 304 && cached) {
          const refreshed = cache.revalidated(key, response);
          if (refreshed) return refreshed;
        }
        if (!bypassCache && cacheable) {
          cache.store(key, request, response, Boolean(request.cachePartition));
        }
        return response;
      });

      if (deduplicate) inFlight.set(key, task);
      try {
        const response = await task;
        logger.debug(`${request.method} ${url.origin} returned ${response.status}`);
        return copyResponse(response);
      } catch (error) {
        runtime.metrics.refract_request_failures_total += 1;
        throw error;
      } finally {
        if (deduplicate && inFlight.get(key) === task) inFlight.delete(key);
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      scheduler.close();
      cache.clear();
      await transport.close();
    },
  };

  return runtime;
}
