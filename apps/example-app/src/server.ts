import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRefractRuntime,
  RefractError,
  type RefractResponse,
} from "@refractjs/refract-core";
import { FetchTransport } from "@refractjs/refract-transport-fetch";

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(root, "../public");
const fixtureRoot = join(publicRoot, "fixture");
const requestTimeoutMs = 4000;
const maximumRequestBodyBytes = 4096;
const maximumRedirects = 3;
const proxyPrefix = "/__fractal/view/";

const appFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.css", ["app.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/navigation.js", ["navigation.js", "text/javascript; charset=utf-8"]],
]);

const fixtureFiles = new Map<string, [string | null, string]>([
  ["/fixture/", ["index.html", "text/html; charset=utf-8"]],
  ["/fixture/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/fixture/next.html", ["next.html", "text/html; charset=utf-8"]],
  ["/fixture/fixture.css", ["fixture.css", "text/css; charset=utf-8"]],
  ["/fixture/fixture.js", ["fixture.js", "text/javascript; charset=utf-8"]],
  ["/fixture/fixture.svg", ["fixture.svg", "image/svg+xml"]],
  ["/fixture/data.json", ["data.json", "application/json; charset=utf-8"]],
  ["/fixture/redirect-local", [null, "text/plain; charset=utf-8"]],
  ["/fixture/redirect-external", [null, "text/plain; charset=utf-8"]],
  ["/fixture/slow", [null, "text/plain; charset=utf-8"]],
]);

type AppFile = [string, string];

export interface ExampleServerOptions {
  host?: string;
  port?: number;
  fixturePort?: number;
}

export interface ExampleServer {
  appUrl: string;
  fixtureOrigin: string;
  getEvents(): DiagnosticEvent[];
  close(): Promise<void>;
}

interface DiagnosticEvent {
  type: string;
  timestamp: string;
  navigationId?: string;
  requestId?: string;
  destinationOrigin?: string;
  resourceType?: string;
  transport?: string;
  status?: number;
  contentType?: string;
  durationMs?: number;
  responseBytes?: number;
  errorCode?: string;
}

interface PendingResponse {
  target: URL;
  response: RefractResponse;
  createdAt: number;
}

class DestinationPolicyError extends Error {
  constructor() {
    super("This example only allows the controlled local fixture.");
    this.name = "DestinationPolicyError";
  }
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not determine the server port."));
        return;
      }
      resolveListen(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
    server.closeAllConnections();
  });
}

function header(response: RefractResponse, name: string): string | undefined {
  const key = Object.keys(response.headers).find(
    (candidate) => candidate.toLowerCase() === name,
  );
  return key ? response.headers[key] : undefined;
}

function bodyBytes(response: RefractResponse): number {
  return typeof response.body === "string"
    ? Buffer.byteLength(response.body)
    : response.body.byteLength;
}

function errorCode(error: unknown): string {
  if (error instanceof DestinationPolicyError) return "DESTINATION_NOT_ALLOWED";
  if (error instanceof RefractError) return error.code;
  if (error instanceof Error && error.name === "AbortError")
    return "REQUEST_CANCELLED";
  return "REFRACT_E_TRANSPORT";
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maximumRequestBodyBytes)
      throw new Error("Request body is too large.");
    chunks.push(bytes);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}

function writeFixtureResponse(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const fixture = fixtureFiles.get(url.pathname);
  if (!fixture) {
    res.writeHead(404, { "Cache-Control": "no-store" });
    res.end("Fixture not found.");
    return;
  }

  if (url.pathname === "/fixture/redirect-local") {
    res.writeHead(302, {
      Location: "/fixture/next.html",
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }
  if (url.pathname === "/fixture/redirect-external") {
    res.writeHead(302, {
      Location: "https://example.com/",
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }
  if (url.pathname === "/fixture/slow") {
    const timer = setTimeout(() => {
      res.writeHead(200, {
        "Content-Type": fixture[1],
        "Cache-Control": "no-store",
      });
      res.end("slow response");
    }, 2500);
    res.on("close", () => clearTimeout(timer));
    return;
  }

  void readFile(join(fixtureRoot, fixture[0]!)).then(
    (body) => {
      res.writeHead(200, {
        "Content-Type": fixture[1],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(body);
    },
    () => {
      res.writeHead(500, { "Cache-Control": "no-store" });
      res.end("Could not read the controlled fixture.");
    },
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character]!;
  });
}

function writeFrameError(
  res: ServerResponse,
  status: number,
  message: string,
): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'none'",
  });
  res.end(`<!doctype html><meta charset="utf-8"><p>${escapeHtml(message)}</p>`);
}

export async function startExampleServer(
  options: ExampleServerOptions = {},
): Promise<ExampleServer> {
  const host = options.host ?? "127.0.0.1";
  const fixtureServer = createServer(writeFixtureResponse);
  const fixturePort = await listen(
    fixtureServer,
    host,
    options.fixturePort ?? 3001,
  );
  const fixtureOrigin = `http://${host}:${fixturePort}`;
  const appServer = createServer();
  const csrfToken = randomUUID();
  let appOrigin = "";
  let closed = false;
  const events: DiagnosticEvent[] = [];
  const pendingResponses = new Map<string, PendingResponse>();
  const activeRequests = new Map<string, AbortController>();
  const navigationOrigins = new Map<string, string>();

  const fetchTransport = new FetchTransport({
    allowedOrigins: [fixtureOrigin],
    allowLoopback: true,
    allowPrivateNetwork: false,
    maxRequestBytes: 32 * 1024,
    maxUploadBytes: 0,
    maxResponseBytes: 2 * 1024 * 1024,
  });
  const runtime = createRefractRuntime({
    name: "fractal-local-example",
    transport: fetchTransport,
    config: {
      security: {
        allowedOrigins: [fixtureOrigin],
        allowLoopback: true,
        allowPrivateNetwork: false,
        maxRequestBytes: 32 * 1024,
        maxUploadBytes: 0,
        maxResponseBytes: 2 * 1024 * 1024,
        requireOriginCheck: true,
      },
      scheduler: {
        maxConcurrentRequests: 8,
        maxConcurrentPerOrigin: 4,
        maxQueuedRequests: 24,
      },
      cache: { maxMemoryBytes: 1024 * 1024 },
    },
  });

  function emit(
    type: string,
    fields: Omit<DiagnosticEvent, "type" | "timestamp"> = {},
  ): void {
    const event: DiagnosticEvent = {
      type,
      timestamp: new Date().toISOString(),
      ...fields,
    };
    events.push(event);
    if (events.length > 200) events.shift();
    console.info(JSON.stringify(event));
  }

  function validateTarget(value: string | URL): URL {
    let target: URL;
    try {
      target = value instanceof URL ? new URL(value) : new URL(value);
    } catch {
      throw new DestinationPolicyError();
    }
    if (
      target.protocol !== "http:" ||
      target.origin !== fixtureOrigin ||
      target.username ||
      target.password ||
      target.search ||
      target.hash
    ) {
      throw new DestinationPolicyError();
    }
    if (target.pathname === "/fixture/")
      target.pathname = "/fixture/index.html";
    if (!fixtureFiles.has(target.pathname)) {
      throw new DestinationPolicyError();
    }
    return target;
  }

  async function fetchTarget(
    initialTarget: URL,
    navigationId: string,
    signal: AbortSignal,
    requestKind: string,
  ): Promise<{ target: URL; response: RefractResponse; durationMs: number }> {
    let target = initialTarget;
    for (
      let redirectCount = 0;
      redirectCount <= maximumRedirects;
      redirectCount += 1
    ) {
      const requestId = randomUUID();
      const startedAt = Date.now();
      emit("REQUEST_DISPATCHED", {
        navigationId,
        requestId,
        destinationOrigin: fixtureOrigin,
        resourceType: requestKind,
        transport: "fetch",
      });
      let response: RefractResponse;
      try {
        response = await runtime.request({
          method: "GET",
          url: target.href,
          signal,
          timeoutMs: requestTimeoutMs,
        });
      } catch (error) {
        emit(signal.aborted ? "REQUEST_CANCELLED" : "NAVIGATION_FAILED", {
          navigationId,
          requestId,
          destinationOrigin: fixtureOrigin,
          resourceType: requestKind,
          transport: "fetch",
          errorCode: errorCode(error),
        });
        throw error;
      }
      const durationMs = Date.now() - startedAt;
      const contentType =
        header(response, "content-type") ?? "application/octet-stream";
      emit("TRANSPORT_RESPONSE_RECEIVED", {
        navigationId,
        requestId,
        destinationOrigin: fixtureOrigin,
        resourceType: requestKind,
        transport: "fetch",
        status: response.status,
        contentType,
        durationMs,
        responseBytes: bodyBytes(response),
      });

      const location = header(response, "location");
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        if (redirectCount === maximumRedirects)
          throw new DestinationPolicyError();
        let redirected: URL;
        try {
          redirected = validateTarget(new URL(location, target));
        } catch {
          emit("DESTINATION_REJECTED", {
            navigationId,
            requestId,
            errorCode: "REDIRECT_DESTINATION_NOT_ALLOWED",
          });
          throw new DestinationPolicyError();
        }
        target = redirected;
        emit("DESTINATION_VALIDATED", {
          navigationId,
          destinationOrigin: fixtureOrigin,
        });
        continue;
      }
      emit("RESPONSE_PROCESSED", {
        navigationId,
        requestId,
        destinationOrigin: fixtureOrigin,
        resourceType: requestKind,
        transport: "fetch",
        status: response.status,
        contentType,
        durationMs,
        responseBytes: bodyBytes(response),
      });
      return { target, response, durationMs };
    }
    throw new DestinationPolicyError();
  }

  function isTrustedApiRequest(req: IncomingMessage): boolean {
    const token = req.headers["x-fractal-example-token"];
    const fetchSite = req.headers["sec-fetch-site"];
    return (
      token === csrfToken &&
      (fetchSite === undefined ||
        fetchSite === "same-origin" ||
        fetchSite === "none")
    );
  }

  function getFrameRoute(
    pathname: string,
  ): { navigationId: string; target: URL } | undefined {
    const match = pathname.match(
      /^\/__fractal\/view\/([0-9a-f-]{36})(\/fixture\/.*)$/i,
    );
    if (!match) return undefined;
    try {
      return {
        navigationId: match[1]!,
        target: validateTarget(new URL(match[2]!, fixtureOrigin)),
      };
    } catch {
      return undefined;
    }
  }

  function writeFrameResponse(
    res: ServerResponse,
    response: RefractResponse,
  ): void {
    const contentType =
      header(response, "content-type") ?? "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    };
    if (contentType.toLowerCase().startsWith("text/html")) {
      headers["Content-Security-Policy"] = [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
      ].join("; ");
    }
    res.writeHead(response.status, headers);
    res.end(
      typeof response.body === "string"
        ? response.body
        : Buffer.from(response.body),
    );
  }

  async function handleNavigate(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!isTrustedApiRequest(req)) {
      jsonResponse(res, 403, {
        ok: false,
        error: "Cross-origin navigation is not allowed.",
      });
      return;
    }
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch {
      jsonResponse(res, 400, {
        ok: false,
        error: "Invalid or oversized navigation request.",
      });
      return;
    }
    const navigationId = body.navigationId;
    if (
      typeof navigationId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(navigationId) ||
      typeof body.url !== "string"
    ) {
      jsonResponse(res, 400, {
        ok: false,
        error: "Invalid navigation request.",
      });
      return;
    }

    const controller = new AbortController();
    activeRequests.set(navigationId, controller);
    const abortOnClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", abortOnClose);
    const startedAt = Date.now();
    emit("NAVIGATION_STARTED", { navigationId, transport: "fetch" });
    try {
      const target = validateTarget(body.url);
      emit("URL_RESOLVED", {
        navigationId,
        destinationOrigin: target.origin,
      });
      emit("DESTINATION_VALIDATED", {
        navigationId,
        destinationOrigin: fixtureOrigin,
      });
      const fetched = await fetchTarget(
        target,
        navigationId,
        controller.signal,
        "document",
      );
      if (!fetched.response.ok) {
        emit("NAVIGATION_FAILED", {
          navigationId,
          destinationOrigin: fixtureOrigin,
          status: fetched.response.status,
          errorCode: `HTTP_${fetched.response.status}`,
        });
        jsonResponse(res, 200, {
          ok: false,
          status: fetched.response.status,
          error: `The local fixture returned HTTP ${fetched.response.status}.`,
        });
        return;
      }

      pendingResponses.set(navigationId, {
        target: fetched.target,
        response: fetched.response,
        createdAt: Date.now(),
      });
      navigationOrigins.set(navigationId, fixtureOrigin);
      while (pendingResponses.size > 8) {
        const oldestId = pendingResponses.keys().next().value as
          | string
          | undefined;
        if (!oldestId) break;
        pendingResponses.delete(oldestId);
        navigationOrigins.delete(oldestId);
      }
      for (const [id, pending] of pendingResponses) {
        if (Date.now() - pending.createdAt > 30_000) {
          pendingResponses.delete(id);
          navigationOrigins.delete(id);
        }
      }
      jsonResponse(res, 200, {
        ok: true,
        navigationId,
        finalUrl: fetched.target.href,
        status: fetched.response.status,
        contentType:
          header(fetched.response, "content-type") ??
          "application/octet-stream",
        responseBytes: bodyBytes(fetched.response),
        durationMs: Date.now() - startedAt,
        framePath: `${proxyPrefix}${navigationId}${fetched.target.pathname}`,
      });
    } catch (error) {
      const code = errorCode(error);
      if (code === "DESTINATION_NOT_ALLOWED") {
        emit("DESTINATION_REJECTED", { navigationId, errorCode: code });
      }
      if (!controller.signal.aborted) {
        emit("NAVIGATION_FAILED", { navigationId, errorCode: code });
        if (!res.writableEnded) {
          const status =
            code === "DESTINATION_NOT_ALLOWED"
              ? 403
              : code === "REFRACT_E_TIMEOUT"
                ? 504
                : 502;
          jsonResponse(res, status, {
            ok: false,
            error:
              code === "DESTINATION_NOT_ALLOWED"
                ? "This example is restricted to its controlled local fixture."
                : "Fractal could not load the local fixture.",
            code,
          });
        }
      }
    } finally {
      res.off("close", abortOnClose);
      activeRequests.delete(navigationId);
    }
  }

  async function handleFrame(
    req: IncomingMessage,
    res: ServerResponse,
    route: { navigationId: string; target: URL },
  ): Promise<void> {
    const controller = new AbortController();
    const abortOnClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", abortOnClose);
    try {
      const pending = pendingResponses.get(route.navigationId);
      let target = route.target;
      let response: RefractResponse;
      if (
        pending &&
        pending.target.href === target.href &&
        Date.now() - pending.createdAt < 30_000
      ) {
        pendingResponses.delete(route.navigationId);
        response = pending.response;
      } else {
        const fetched = await fetchTarget(
          target,
          route.navigationId,
          controller.signal,
          "resource",
        );
        target = fetched.target;
        response = fetched.response;
      }
      writeFrameResponse(res, response);
    } catch (error) {
      if (!controller.signal.aborted && !res.writableEnded) {
        const code = errorCode(error);
        emit("NAVIGATION_FAILED", {
          navigationId: route.navigationId,
          destinationOrigin: fixtureOrigin,
          errorCode: code,
        });
        writeFrameError(
          res,
          code === "DESTINATION_NOT_ALLOWED" ? 403 : 502,
          code === "DESTINATION_NOT_ALLOWED"
            ? "The redirected destination is outside the local fixture."
            : "Fractal could not load this fixture resource.",
        );
      }
    } finally {
      res.off("close", abortOnClose);
    }
  }

  appServer.on("request", (req, res) => {
    void (async () => {
      const requestUrl = new URL(req.url ?? "/", appOrigin);
      if (req.method === "GET" && requestUrl.pathname === "/api/config") {
        jsonResponse(res, 200, {
          fixtureOrigin,
          fixtureUrl: `${fixtureOrigin}/fixture/index.html`,
          csrfToken,
          transport: "fetch",
          scope: "controlled loopback fixture only",
        });
        return;
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/diagnostics") {
        jsonResponse(res, 200, {
          runtime: { ...runtime.metrics },
          transport: {
            kind: fetchTransport.kind,
            status: fetchTransport.status,
            ...fetchTransport.getMetrics(),
          },
          scope: "controlled loopback fixture only",
        });
        return;
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/events") {
        jsonResponse(res, 200, { events: events.slice(-100) });
        return;
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/navigate") {
        await handleNavigate(req, res);
        return;
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/cancel") {
        if (!isTrustedApiRequest(req)) {
          jsonResponse(res, 403, { ok: false });
          return;
        }
        try {
          const body = await readJson(req);
          if (typeof body.navigationId === "string") {
            const controller = activeRequests.get(body.navigationId);
            controller?.abort();
            const removed = pendingResponses.delete(body.navigationId);
            navigationOrigins.delete(body.navigationId);
            if (controller || removed)
              emit("REQUEST_CANCELLED", { navigationId: body.navigationId });
          }
          jsonResponse(res, 200, { ok: true });
        } catch {
          jsonResponse(res, 400, { ok: false });
        }
        return;
      }
      if (
        req.method === "POST" &&
        requestUrl.pathname === "/api/navigation-complete"
      ) {
        if (!isTrustedApiRequest(req)) {
          jsonResponse(res, 403, { ok: false });
          return;
        }
        try {
          const body = await readJson(req);
          if (
            typeof body.navigationId === "string" &&
            navigationOrigins.has(body.navigationId)
          ) {
            emit("NAVIGATION_COMPLETED", {
              navigationId: body.navigationId,
              destinationOrigin: fixtureOrigin,
            });
            navigationOrigins.delete(body.navigationId);
          }
          jsonResponse(res, 200, { ok: true });
        } catch {
          jsonResponse(res, 400, { ok: false });
        }
        return;
      }

      const frameRoute = getFrameRoute(requestUrl.pathname);
      if (req.method === "GET" && frameRoute) {
        await handleFrame(req, res, frameRoute);
        return;
      }

      const appFile = appFiles.get(requestUrl.pathname) as AppFile | undefined;
      if (req.method === "GET" && appFile) {
        const body = await readFile(join(publicRoot, appFile[0]));
        res.writeHead(200, {
          "Content-Type": appFile[1],
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          ...(requestUrl.pathname === "/"
            ? {
                "Content-Security-Policy":
                  "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
              }
            : {}),
        });
        res.end(body);
        return;
      }
      res.writeHead(404, {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end("Not found.");
    })().catch(() => {
      if (!res.writableEnded)
        jsonResponse(res, 500, {
          ok: false,
          error: "The example server failed.",
        });
    });
  });

  try {
    const port = await listen(appServer, host, options.port ?? 3000);
    appOrigin = `http://${host}:${port}`;
    return {
      appUrl: appOrigin,
      fixtureOrigin,
      getEvents: () => events.map((event) => ({ ...event })),
      async close() {
        if (closed) return;
        closed = true;
        await closeServer(appServer);
        await closeServer(fixtureServer);
        await runtime.close();
      },
    };
  } catch (error) {
    await closeServer(fixtureServer);
    await runtime.close();
    throw error;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT ?? 3000);
  const fixturePort = Number(process.env.FRACTAL_FIXTURE_PORT ?? 3001);
  startExampleServer({ port, fixturePort })
    .then((server) => {
      console.log(`Fractal example listening at ${server.appUrl}`);
      console.log(`Controlled fixture origin: ${server.fixtureOrigin}`);
      const shutdown = () => {
        void server.close().then(() => process.exit(0));
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    })
    .catch((error: unknown) => {
      console.error(
        "Could not start the Fractal example:",
        error instanceof Error ? error.message : "unknown error",
      );
      process.exitCode = 1;
    });
}
