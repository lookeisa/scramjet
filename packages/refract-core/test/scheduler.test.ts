import assert from "node:assert/strict";
import test from "node:test";

import { RequestScheduler } from "@refractjs/refract-core";

test("runs another origin while one origin is at its concurrency limit", async () => {
  const scheduler = new RequestScheduler({
    maxConcurrentRequests: 2,
    maxConcurrentPerOrigin: 1,
    maxQueuedRequests: 4,
  });
  const started: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = scheduler.schedule("https://one.test", 0, undefined, async () => {
    started.push("one-active");
    await firstGate;
  });
  const second = scheduler.schedule("https://one.test", 0, undefined, async () => {
    started.push("one-queued");
  });
  const otherOrigin = scheduler.schedule("https://two.test", 0, undefined, async () => {
    started.push("two-active");
  });

  await otherOrigin;
  assert.deepEqual(started, ["one-active", "two-active"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(started, ["one-active", "two-active", "one-queued"]);
  scheduler.close();
});

test("bounds queued work and removes an aborted queued request", async () => {
  const scheduler = new RequestScheduler({
    maxConcurrentRequests: 1,
    maxConcurrentPerOrigin: 1,
    maxQueuedRequests: 1,
  });
  let releaseActive!: () => void;
  const activeGate = new Promise<void>((resolve) => {
    releaseActive = resolve;
  });
  const active = scheduler.schedule("https://one.test", 0, undefined, () => activeGate);
  const abortController = new AbortController();
  const queued = scheduler.schedule("https://one.test", 0, abortController.signal, async () => {});

  await assert.rejects(
    scheduler.schedule("https://one.test", 0, undefined, async () => {}),
    (error: Error) => error.message.startsWith("REFRACT_E_QUEUE_FULL:")
  );
  abortController.abort();
  await assert.rejects(
    queued,
    (error: Error) => error.message.startsWith("REFRACT_E_ABORTED:")
  );
  releaseActive();
  await active;
  scheduler.close();
});
