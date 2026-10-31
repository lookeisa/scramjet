import type {
  RefractLogger,
  RefractRequest,
  RefractResponse,
  RefractTransportKind,
} from "@refractjs/refract-shared";

export type TransportStatus = "idle" | "connecting" | "ready" | "closed" | "error";

export interface TransportMetrics {
  refract_transport_requests_total: number;
  refract_transport_connected_timestamp: number | null;
  refract_transport_last_error: string | null;
  refract_transport_bytes_in_total: number;
  refract_transport_bytes_out_total: number;
}

export interface RefractTransport {
  readonly kind: RefractTransportKind;
  readonly status: TransportStatus;
  readonly logger?: RefractLogger;
  connect(): Promise<void>;
  request(req: RefractRequest): Promise<RefractResponse>;
  close(): Promise<void>;
  getMetrics(): TransportMetrics;
}

export abstract class BaseTransport implements RefractTransport {
  readonly kind: RefractTransportKind;
  status: TransportStatus = "idle";
  logger?: RefractLogger;
  private readonly metrics: TransportMetrics = {
    refract_transport_requests_total: 0,
    refract_transport_connected_timestamp: null,
    refract_transport_last_error: null,
    refract_transport_bytes_in_total: 0,
    refract_transport_bytes_out_total: 0,
  };

  constructor(kind: RefractTransportKind, logger?: RefractLogger) {
    this.kind = kind;
    this.logger = logger;
  }

  async connect(): Promise<void> {
    this.status = "ready";
    this.metrics.refract_transport_connected_timestamp = Date.now();
    this.logger?.info(`transport ${this.kind} connected`);
  }

  async close(): Promise<void> {
    this.status = "closed";
    this.logger?.info(`transport ${this.kind} closed`);
  }

  protected accountRequest(req: RefractRequest, response: RefractResponse): void {
    this.metrics.refract_transport_requests_total += 1;
    this.metrics.refract_transport_bytes_out_total += typeof req.body === "string" ? new TextEncoder().encode(req.body).byteLength : (req.body?.byteLength ?? 0);
    this.metrics.refract_transport_bytes_in_total += typeof response.body === "string" ? new TextEncoder().encode(response.body).byteLength : (response.body?.byteLength ?? 0);
  }

  protected markError(message: string): void {
    this.status = "error";
    this.metrics.refract_transport_last_error = message;
    this.logger?.error(message);
  }

  getMetrics(): TransportMetrics {
    return { ...this.metrics };
  }

  abstract request(req: RefractRequest): Promise<RefractResponse>;
}
