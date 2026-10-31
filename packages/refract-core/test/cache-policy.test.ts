import assert from "node:assert/strict";
import test from "node:test";

import { MemoryResponseCache } from "@refractjs/refract-core";

test("evicts least-recently-used entries to enforce the configured memory bound", () => {
  const cache = new MemoryResponseCache({ maxBytes: 500 });
  const response = {
    status: 200,
    statusText: "OK",
    headers: { "cache-control": "public, max-age=60" },
    body: new Uint8Array(200),
    ok: true,
  };

  assert.equal(cache.store("one", { method: "GET", url: "https://one.test/" }, response, false), true);
  assert.ok(cache.lookup("one"));
  assert.equal(cache.store("two", { method: "GET", url: "https://two.test/" }, response, false), true);
  assert.ok(cache.sizeBytes <= 500);
  assert.equal(cache.lookup("one"), undefined);
  assert.ok(cache.lookup("two"));
});

test("does not store no-store responses or private responses without a partition", () => {
  const cache = new MemoryResponseCache({ maxBytes: 1024 });
  const response = {
    status: 200,
    statusText: "OK",
    headers: { "cache-control": "private, max-age=60" },
    body: "private",
    ok: true,
  };

  assert.equal(cache.store("private", { method: "GET", url: "https://one.test/" }, response, false), false);
  assert.equal(cache.store("no-store", { method: "GET", url: "https://one.test/", headers: { "cache-control": "no-store" } }, response, true), false);
  assert.equal(cache.sizeBytes, 0);
});
