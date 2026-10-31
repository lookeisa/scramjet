import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import test from "node:test";

import { FetchTransport } from "@refractjs/refract-transport-fetch";
import { createRefractRuntime } from "@refractjs/refract-core";

async function startServer(handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function runtimeFor(origin: string) {
  return createRefractRuntime({
    transport: new FetchTransport({ allowedOrigins: [origin], allowLoopback: true }),
    config: {
      security: { allowedOrigins: [origin], allowLoopback: true },
    },
  });
}

test("revalidates stale entries with ETag and returns the cached representation", async () => {
  let received = 0;
  let conditionalHeader: string | undefined;
  const { server, origin } = await startServer((request, response) => {
    received += 1;
    conditionalHeader = request.headers["if-none-match"];
    if (conditionalHeader === '"v1"') {
      response.writeHead(304, {
        "cache-control": "public, max-age=60",
        etag: '"v1"',
      });
      response.end();
      return;
    }
    response.writeHead(200, {
      "cache-control": "public, max-age=0",
      etag: '"v1"',
      "last-modified": "Wed, 21 Oct 2015 07:28:00 GMT",
    });
    response.end("cached representation");
  });
  const runtime = runtimeFor(origin);

  try {
    const first = await runtime.request({ method: "GET", url: `${origin}/etag` });
    const second = await runtime.request({ method: "GET", url: `${origin}/etag` });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(typeof second.body === "string" ? second.body : new TextDecoder().decode(second.body), "cached representation");
    assert.equal(conditionalHeader, '"v1"');
    assert.equal(received, 2);
  } finally {
    await runtime.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("keeps private responses isolated between explicit cache partitions", async () => {
  let received = 0;
  const { server, origin } = await startServer((_request, response) => {
    received += 1;
    response.writeHead(200, { "cache-control": "private, max-age=60" });
    response.end(`private response ${received}`);
  });
  const runtime = runtimeFor(origin);

  try {
    await runtime.request({ method: "GET", url: `${origin}/private`, cachePartition: "user-a" });
    await runtime.request({ method: "GET", url: `${origin}/private`, cachePartition: "user-a" });
    await runtime.request({ method: "GET", url: `${origin}/private`, cachePartition: "user-b" });
    assert.equal(received, 2);
  } finally {
    await runtime.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
