import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { startExampleServer, type ExampleServer } from "../src/server.ts";

let server: ExampleServer;
let csrfToken: string;

before(async () => {
  server = await startExampleServer({ port: 0, fixturePort: 0 });
  csrfToken = (await (await fetch(`${server.appUrl}/api/config`)).json())
    .csrfToken;
});

after(async () => {
  await server?.close();
});

async function navigate(url: string, navigationId = randomUUID()) {
  const response = await fetch(`${server.appUrl}/api/navigate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Fractal-Example-Token": csrfToken,
    },
    body: JSON.stringify({ navigationId, url }),
  });
  return { response, result: await response.json(), navigationId };
}

async function waitForEvent(
  predicate: (event: ReturnType<ExampleServer["getEvents"]>[number]) => boolean,
) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const event = server.getEvents().find(predicate);
    if (event) return event;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(
    "Timed out waiting for the expected Fractal diagnostic event.",
  );
}

test("loads HTML and relative resources through the public Fractal runtime", async () => {
  const configResponse = await fetch(`${server.appUrl}/api/config`);
  const config = await configResponse.json();
  const result = await navigate(`${config.fixtureOrigin}/fixture/index.html`);
  assert.equal(result.response.status, 200);
  assert.equal(result.result.ok, true);
  assert.equal(result.result.status, 200);
  assert.match(result.result.contentType, /text\/html/);

  const documentResponse = await fetch(
    new URL(result.result.framePath, server.appUrl),
  );
  const document = await documentResponse.text();
  assert.equal(documentResponse.status, 200);
  assert.match(document, /A real response through Fractal/);
  assert.match(
    documentResponse.headers.get("content-security-policy") ?? "",
    /default-src 'none'/,
  );

  const cssUrl = new URL(
    "./fixture.css",
    new URL(result.result.framePath, server.appUrl),
  );
  const cssResponse = await fetch(cssUrl);
  assert.equal(cssResponse.status, 200);
  assert.match(await cssResponse.text(), /fixture-page/);

  for (const [path, contentType, content] of [
    ["fixture.js", /javascript/, /#count-button/],
    ["fixture.svg", /image\/svg\+xml/, /<svg/],
    ["data.json", /application\/json/, /fetched through Fractal/],
  ] as const) {
    const resourceUrl = new URL(
      `/__fractal/view/${result.navigationId}/fixture/${path}`,
      server.appUrl,
    );
    const resourceResponse = await fetch(resourceUrl);
    assert.equal(resourceResponse.status, 200);
    assert.match(
      resourceResponse.headers.get("content-type") ?? "",
      contentType,
    );
    assert.match(await resourceResponse.text(), content);
  }

  const eventsResponse = await fetch(`${server.appUrl}/api/events`);
  const { events } = await eventsResponse.json();
  assert(
    events.some(
      (event: { type: string; navigationId: string }) =>
        event.type === "NAVIGATION_STARTED" &&
        event.navigationId === result.navigationId,
    ),
  );
  assert(
    events.filter(
      (event: { type: string }) => event.type === "TRANSPORT_RESPONSE_RECEIVED",
    ).length >= 2,
  );
});

test("reports actual Fractal runtime and Fetch transport diagnostics", async () => {
  const response = await fetch(`${server.appUrl}/api/diagnostics`);
  const diagnostics = await response.json();
  assert.equal(response.status, 200);
  assert.equal(diagnostics.transport.kind, "fetch");
  const requestsBefore = diagnostics.runtime.refract_requests_total;
  const transportRequestsBefore =
    diagnostics.transport.refract_transport_requests_total;

  await navigate(`${server.fixtureOrigin}/fixture/index.html`);
  const updated = await (
    await fetch(`${server.appUrl}/api/diagnostics`)
  ).json();
  assert.equal(updated.transport.status, "ready");
  assert.equal(updated.runtime.refract_requests_total, requestsBefore + 1);
  assert.equal(
    updated.transport.refract_transport_requests_total,
    transportRequestsBefore + 1,
  );
  assert.equal(updated.scope, "controlled loopback fixture only");
});

test("rejects destinations outside the fixed fixture before transport dispatch", async () => {
  const beforeRequests = server
    .getEvents()
    .filter((event) => event.type === "REQUEST_DISPATCHED").length;
  const result = await navigate("https://example.com/");
  assert.equal(result.response.status, 403);
  assert.equal(result.result.code, "DESTINATION_NOT_ALLOWED");
  assert.equal(
    server.getEvents().filter((event) => event.type === "REQUEST_DISPATCHED")
      .length,
    beforeRequests,
  );
});

test("rejects state-changing API requests without the same-origin token", async () => {
  const response = await fetch(`${server.appUrl}/api/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      navigationId: randomUUID(),
      url: server.fixtureOrigin,
    }),
  });
  assert.equal(response.status, 403);
  assert.equal(
    (await response.json()).error,
    "Cross-origin navigation is not allowed.",
  );
});

test("accepts token-authenticated app requests behind a forwarded origin", async () => {
  const response = await fetch(`${server.appUrl}/api/navigate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Fractal-Example-Token": csrfToken,
      Origin: "https://codespace-forwarded.example",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify({
      navigationId: randomUUID(),
      url: `${server.fixtureOrigin}/fixture/index.html`,
    }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test("revalidates each redirect and follows only fixture destinations", async () => {
  const local = await navigate(
    `${server.fixtureOrigin}/fixture/redirect-local`,
  );
  assert.equal(local.response.status, 200);
  assert.equal(
    local.result.finalUrl,
    `${server.fixtureOrigin}/fixture/next.html`,
  );

  const external = await navigate(
    `${server.fixtureOrigin}/fixture/redirect-external`,
  );
  assert.equal(external.response.status, 403);
  assert(
    server
      .getEvents()
      .some(
        (event) =>
          event.type === "DESTINATION_REJECTED" &&
          event.navigationId === external.navigationId,
      ),
  );
});

test("cancels an active Fractal request when the caller disconnects", async () => {
  const navigationId = randomUUID();
  const controller = new AbortController();
  const request = fetch(`${server.appUrl}/api/navigate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Fractal-Example-Token": csrfToken,
    },
    body: JSON.stringify({
      navigationId,
      url: `${server.fixtureOrigin}/fixture/slow`,
    }),
    signal: controller.signal,
  });

  await waitForEvent(
    (event) =>
      event.type === "REQUEST_DISPATCHED" &&
      event.navigationId === navigationId,
  );
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
  await waitForEvent(
    (event) =>
      event.type === "REQUEST_CANCELLED" && event.navigationId === navigationId,
  );
});
