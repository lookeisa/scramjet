import assert from "node:assert/strict";
import test from "node:test";

import { FetchTransport } from "@refractjs/refract-transport-fetch";

const ORIGIN = "https://destination.test";

function isRefractError(code: string) {
  return (error: Error) => error.message.startsWith(`${code}:`);
}

test("rejects oversized request targets and uploads before calling fetch", async () => {
  let calls = 0;
  const transport = new FetchTransport({
    allowedOrigins: [ORIGIN],
    maxRequestBytes: 20,
    maxUploadBytes: 2,
    fetchImpl: async () => {
      calls += 1;
      return new Response("ok");
    },
  });

  await assert.rejects(
    transport.request({ method: "GET", url: `${ORIGIN}/this-path-exceeds-the-limit` }),
    isRefractError("REFRACT_E_TRANSPORT")
  );
  await assert.rejects(
    transport.request({ method: "POST", url: `${ORIGIN}/`, body: "abc" }),
    isRefractError("REFRACT_E_TRANSPORT")
  );
  assert.equal(calls, 0);
});

test("aborts an oversized response while enforcing the response byte limit", async () => {
  let cancelled = false;
  const transport = new FetchTransport({
    allowedOrigins: [ORIGIN],
    maxResponseBytes: 3,
    fetchImpl: async () => new Response("large", {
      headers: { "content-length": "5" },
    }),
  });

  await assert.rejects(
    transport.request({ method: "GET", url: `${ORIGIN}/large` }),
    (error: Error) => {
      cancelled = error.message.startsWith("REFRACT_E_TRANSPORT:");
      return cancelled;
    }
  );
  assert.equal(cancelled, true);
});

test("returns redirects without following them", async () => {
  let redirectMode: RequestRedirect | undefined;
  const transport = new FetchTransport({
    allowedOrigins: [ORIGIN],
    fetchImpl: async (_input, init) => {
      redirectMode = init?.redirect;
      return new Response(null, {
        status: 302,
        headers: { location: "https://other.test/target" },
      });
    },
  });

  const response = await transport.request({ method: "GET", url: `${ORIGIN}/redirect` });
  assert.equal(redirectMode, "manual");
  assert.equal(response.status, 302);
  assert.equal(response.headers.location, "https://other.test/target");
});

test("reports caller cancellation and timeout as distinct standardized errors", async () => {
  const transport = new FetchTransport({
    allowedOrigins: [ORIGIN],
    fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("request aborted", "AbortError"));
      }, { once: true });
    }),
  });
  const abortController = new AbortController();
  const cancelled = transport.request({
    method: "GET",
    url: `${ORIGIN}/cancel`,
    signal: abortController.signal,
  });
  abortController.abort();
  await assert.rejects(cancelled, isRefractError("REFRACT_E_ABORTED"));

  await assert.rejects(
    transport.request({ method: "GET", url: `${ORIGIN}/timeout`, timeoutMs: 1 }),
    isRefractError("REFRACT_E_TIMEOUT")
  );
});
