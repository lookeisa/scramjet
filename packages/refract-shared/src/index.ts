export type RefractTransportKind = "fetch" | "wisp";

export type RefractErrorCode =
  | "REFRACT_E_INVALID_URL"
  | "REFRACT_E_CONFIG"
  | "REFRACT_E_ORIGIN_NOT_ALLOWED"
  | "REFRACT_E_QUEUE_FULL"
  | "REFRACT_E_ABORTED"
  | "REFRACT_E_TIMEOUT"
  | "REFRACT_E_TRANSPORT"
  | "REFRACT_E_REWRITER_UNAVAILABLE"
  | "REFRACT_E_CLOSED";

export class RefractError extends Error {
  readonly code: RefractErrorCode;

  constructor(
    code: RefractErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(`${code}: ${message}`, options);
    this.name = "RefractError";
    this.code = code;
  }
}

export interface RefractLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export const defaultRefractLogger: RefractLogger = {
  debug: (message, ...args) => console.debug(`[refract] ${message}`, ...args),
  info: (message, ...args) => console.info(`[refract] ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[refract] ${message}`, ...args),
  error: (message, ...args) => console.error(`[refract] ${message}`, ...args),
};

export interface RefractRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | string;
  url: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  body?: Uint8Array | string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  priority?: number;
  cachePartition?: string;
}

export interface RefractResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Uint8Array | string;
  ok: boolean;
}

export interface RefractTransportConfig {
  defaultTransport: RefractTransportKind;
  allowedTransports: RefractTransportKind[];
  maxConcurrentStreams: number;
}

export interface RefractRewriterConfig {
  enabled: boolean;
  rewriteHtml: boolean;
  rewriteCss: boolean;
  rewriteJs: boolean;
  rewriteUrls: boolean;
}

export interface RefractSchedulerConfig {
  maxConcurrentRequests: number;
  maxConcurrentPerOrigin: number;
  maxQueuedRequests: number;
}

export interface RefractCacheConfig {
  maxMemoryBytes: number;
}

export interface RefractSecurityConfig {
  allowLoopback: boolean;
  allowPrivateNetwork: boolean;
  allowedOrigins: string[];
  maxRequestBytes: number;
  maxUploadBytes: number;
  maxResponseBytes: number;
  requireOriginCheck: boolean;
}

export interface RefractConfig {
  transport: RefractTransportConfig;
  rewriter: RefractRewriterConfig;
  scheduler: RefractSchedulerConfig;
  cache: RefractCacheConfig;
  security: RefractSecurityConfig;
}

export const defaultRefractConfig: RefractConfig = {
  transport: {
    defaultTransport: "fetch",
    allowedTransports: ["fetch"],
    maxConcurrentStreams: 256,
  },
  rewriter: {
    enabled: false,
    rewriteHtml: false,
    rewriteCss: false,
    rewriteJs: false,
    rewriteUrls: false,
  },
  scheduler: {
    maxConcurrentRequests: 64,
    maxConcurrentPerOrigin: 6,
    maxQueuedRequests: 1024,
  },
  cache: {
    maxMemoryBytes: 32 * 1024 * 1024,
  },
  security: {
    allowLoopback: false,
    allowPrivateNetwork: false,
    allowedOrigins: [],
    maxRequestBytes: 25 * 1024 * 1024,
    maxUploadBytes: 10 * 1024 * 1024,
    maxResponseBytes: 25 * 1024 * 1024,
    requireOriginCheck: true,
  },
};
