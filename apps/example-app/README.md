# Fractal Example Application

This is a loopback-only browser example for the current Fractal request engine. It demonstrates real responses from a controlled local origin flowing through `@refractjs/refract-core` and its Fetch transport into a sandboxed frame. It is not a general-purpose proxy or a full browser runtime.

## Run

From the repository root:

```sh
pnpm install
pnpm example
```

The app listens on `http://127.0.0.1:3000`; its controlled fixture origin uses port `3001`. Both servers bind to loopback. `PORT` and `FRACTAL_FIXTURE_PORT` may change the ports, but destination access remains restricted to the fixture origin selected at startup. Stop both servers with Ctrl+C.

Useful checks:

```sh
pnpm example:check
pnpm example:test
```

The browser test uses the repository's Playwright dependency. Install Chromium with `pnpm --filter @fractal/example-app exec playwright install chromium`. Playwright also needs its Linux shared libraries; on a provisioned development image use `pnpm --filter @fractal/example-app exec playwright install-deps chromium` (requires system package-manager privileges). If Chromium cannot launch, the test reports a skip with the missing library; a skipped test is not a browser pass.

## Request Flow

1. The address bar sends a navigation request to the example server.
2. The server validates the URL against its single configured loopback fixture origin and fixed fixture path table.
3. It calls the public Fractal `createRefractRuntime().request()` API. Fractal resolves the URL, applies scheduling and limits, and uses the real Fetch transport.
4. The example server returns the actual Fractal response body through an app-origin frame route. Relative fixture resources use that route too, so CSS, JavaScript, SVG, and JSON are fetched separately through the same Fractal runtime.
5. Same-origin redirects are followed only after the next destination passes the same allowlist. External redirects fail closed.

The response body is not rewritten. The frame uses `sandbox="allow-scripts"` without `allow-same-origin` or top-navigation permission. The fixture response has a restrictive Content Security Policy and the app disables forms and limits network destinations. This controlled example does not model origin cookies, storage, arbitrary site policies, service workers, or dynamic website navigation.

## Current Capabilities

- Actual Fractal Core and Fetch transport requests for a fixed local HTML/CSS/JavaScript/SVG/JSON fixture.
- Back, forward, reload, URL normalization, loading and error states.
- Request cancellation when a newer navigation replaces an in-flight request.
- Server-side response-size and timeout limits from Fractal, a bounded scheduler, bounded diagnostics, and manual redirect validation.
- A persistent local homepage preference (fixture or blank), dark-only appearance, and live Fractal/Fetch counters in Settings.
- Unit and Node integration tests for URL/history behavior, fixture responses, allowlist rejection, redirects, and cancellation.

## Not Implemented

- HTML, CSS, or JavaScript rewriting by Fractal.
- A browser-side Fractal runtime, service worker, or interception of arbitrary document requests.
- General website navigation, remote resources, origin cookies/storage, authentication, or safe public gateway behavior.
- DuckDuckGo search requests. Search terms are recognized, but the app displays an explicit unavailable message without sending them. Remote results and their resource/link navigation require a secure remote gateway and rewriting/runtime support.
- DNS pinning. This example does not accept a user-selected remote hostname: it is bound to the exact loopback fixture origin and fixed routes. Do not expose it on a public interface or repurpose the server as an arbitrary fetch endpoint.
- Browser-level pass/fail in environments missing Chromium system dependencies. A skipped Playwright test is not a browser compatibility result.

The address field accepts URL syntax for rejection-path testing, but only the built-in loopback fixture is permitted. A public URL is expected to fail with a clear policy message.
