import { RefractError } from "@refractjs/refract-shared";

interface Job<T> {
  origin: string;
  priority: number;
  createdAt: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
}

export interface SchedulerOptions {
  maxConcurrentRequests: number;
  maxConcurrentPerOrigin: number;
  maxQueuedRequests: number;
  priorityAgingMs?: number;
}

export class RequestScheduler {
  private readonly options: SchedulerOptions;
  private readonly queues = new Map<string, Job<unknown>[]>();
  private readonly origins: string[] = [];
  private readonly activeByOrigin = new Map<string, number>();
  private active = 0;
  private queued = 0;
  private cursor = 0;
  private closed = false;

  constructor(options: SchedulerOptions) {
    this.options = options;
    if (
      options.maxConcurrentRequests < 1 ||
      options.maxConcurrentPerOrigin < 1 ||
      options.maxQueuedRequests < 0 ||
      !Number.isInteger(options.maxQueuedRequests)
    ) {
      throw new RefractError("REFRACT_E_CONFIG", "Invalid request scheduler limits");
    }
  }

  schedule<T>(
    origin: string,
    priority: number,
    signal: AbortSignal | undefined,
    run: () => Promise<T>
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(new RefractError("REFRACT_E_CLOSED", "Scheduler is closed"));
    }
    if (signal?.aborted) {
      return Promise.reject(new RefractError("REFRACT_E_ABORTED", "Request was aborted"));
    }
    const canStart =
      this.active < this.options.maxConcurrentRequests &&
      (this.activeByOrigin.get(origin) ?? 0) < this.options.maxConcurrentPerOrigin;
    if (this.queued >= this.options.maxQueuedRequests && !canStart) {
      return Promise.reject(new RefractError("REFRACT_E_QUEUE_FULL", "Request queue is full"));
    }

    return new Promise<T>((resolve, reject) => {
      const job: Job<T> = {
        origin,
        priority: Number.isFinite(priority) ? priority : 0,
        createdAt: Date.now(),
        run,
        resolve,
        reject,
        signal,
      };
      if (signal) {
        job.abortListener = () => {
          const queue = this.queues.get(origin);
          const index = queue?.indexOf(job as Job<unknown>) ?? -1;
          if (index >= 0) {
            queue!.splice(index, 1);
            this.queued -= 1;
            this.cleanupOrigin(origin);
          }
          reject(new RefractError("REFRACT_E_ABORTED", "Request was aborted"));
          this.drain();
        };
        signal.addEventListener("abort", job.abortListener, { once: true });
      }

      let queue = this.queues.get(origin);
      if (!queue) {
        queue = [];
        this.queues.set(origin, queue);
        this.origins.push(origin);
      }
      queue.push(job as Job<unknown>);
      this.queued += 1;
      this.drain();
    });
  }

  close(): void {
    this.closed = true;
    for (const queue of this.queues.values()) {
      for (const job of queue) {
        job.signal?.removeEventListener("abort", job.abortListener!);
        job.reject(new RefractError("REFRACT_E_CLOSED", "Scheduler is closed"));
      }
    }
    this.queues.clear();
    this.origins.length = 0;
    this.queued = 0;
    this.cursor = 0;
  }

  private drain(): void {
    while (!this.closed && this.active < this.options.maxConcurrentRequests) {
      const job = this.takeNext();
      if (!job) return;
      this.queued -= 1;
      this.active += 1;
      this.activeByOrigin.set(job.origin, (this.activeByOrigin.get(job.origin) ?? 0) + 1);
      job.signal?.removeEventListener("abort", job.abortListener!);

      void job.run().then(job.resolve, job.reject).finally(() => {
        this.active -= 1;
        const activeForOrigin = (this.activeByOrigin.get(job.origin) ?? 1) - 1;
        if (activeForOrigin === 0) this.activeByOrigin.delete(job.origin);
        else this.activeByOrigin.set(job.origin, activeForOrigin);
        this.drain();
      });
    }
  }

  private takeNext(): Job<unknown> | undefined {
    if (this.origins.length === 0) return undefined;
    const now = Date.now();
    const agingMs = Math.max(1, this.options.priorityAgingMs ?? 1000);

    for (let checked = 0; checked < this.origins.length; checked += 1) {
      const index = (this.cursor + checked) % this.origins.length;
      const origin = this.origins[index]!;
      const queue = this.queues.get(origin);
      if (!queue?.length) continue;
      if ((this.activeByOrigin.get(origin) ?? 0) >= this.options.maxConcurrentPerOrigin) continue;

      queue.sort((left, right) => {
        const leftScore = left.priority + Math.floor((now - left.createdAt) / agingMs);
        const rightScore = right.priority + Math.floor((now - right.createdAt) / agingMs);
        return rightScore - leftScore || left.createdAt - right.createdAt;
      });
      const job = queue.shift()!;
      this.cleanupOrigin(origin);
      if (this.origins.length > 0) this.cursor = (index + 1) % this.origins.length;
      return job;
    }
    return undefined;
  }

  private cleanupOrigin(origin: string): void {
    const queue = this.queues.get(origin);
    if (queue?.length) return;
    this.queues.delete(origin);
    const index = this.origins.indexOf(origin);
    if (index >= 0) {
      this.origins.splice(index, 1);
      if (index < this.cursor) this.cursor -= 1;
      if (this.origins.length === 0) this.cursor = 0;
      else this.cursor %= this.origins.length;
    }
  }
}
