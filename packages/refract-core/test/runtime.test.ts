import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { FetchTransport } from "@refractjs/refract-transport-fetch";
import { createRefractRuntime, defaultRefractConfig } from "@refractjs/refract-core";

test("runs an allowlisted request through transport, scheduler, and cache", async () => {
  let received = 0;
  const server = createServer((_request, response) => {
    received += 1;
    response.writeHead(200, {
      "cache-control": "public, max-age=60",
      "content-type": "text/plain",
    });
    response.end("refract pipeline response");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const runtime = createRefractRuntime({
    transport: new FetchTransport({
      allowedOrigins: [origin],
      allowLoopback: true,
    }),
    config: {
      security: {
        allowedOrigins: [origin],
        allowLoopback: true,
      },
      rewriter: { enabled: false },
    },
  });

  try {
    const first = await runtime.request({ method: "GET", url: "/resource", baseUrl: origin });
    const second = await runtime.request({ method: "GET", url: "/resource", baseUrl: origin });

    assert.equal(first.status, 200);
    assert.equal(
      typeof first.body === "string" ? first.body : new TextDecoder().decode(first.body),
      "refract pipeline response"
    );
    assert.equal(second.status, 200);
    assert.equal(received, 1);
    assert.equal(runtime.metrics.refract_requests_total, 2);
    assert.equal(runtime.metrics.refract_cache_hits_total, 1);
  } finally {
    await runtime.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test("rejects requests to origins outside the explicit allowlist", async () => {
  const runtime = createRefractRuntime({
    transport: new FetchTransport({ allowedOrigins: [] }),
  });
  await assert.rejects(
    runtime.request({ method: "GET", url: "https://example.com/" }),
    (error: Error) => error.message.startsWith("REFRACT_E_ORIGIN_NOT_ALLOWED:")
  );
  await runtime.close();
});

test("uses fetch by default and keeps unimplemented content rewriting disabled", () => {
  const runtime = createRefractRuntime();
  assert.equal(runtime.config.transport.defaultTransport, "fetch");
  assert.equal(runtime.config.rewriter.enabled, false);
  assert.equal(defaultRefractConfig.rewriter.enabled, false);
});
