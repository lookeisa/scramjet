# RefractJS Architecture and Migration Inventory

## Repository Audit

This checkout is the Scramjet pnpm monorepo. The requested `artifacts/snorlax-cave` and `artifacts/api-server` directories are absent. Existing application entry points are:

- `devserver.ts` starts the legacy Vite demo and a Wisp server. Its defaults use ports 4141 and 4142; `DEMO_PORT`, `WISP_PORT`, and `VITE_WISP_URL` are legacy application settings.
- `packages/demo` is the Scramjet Vite application.
- `packages/core` contains the Scramjet browser proxy runtime and Rust/WebAssembly rewriter.
- `packages/controller` and `packages/bootstrap` implement Scramjet controller, service-worker, and bootstrap behavior.
- `packages/runway` is the Scramjet browser test harness.
- `packages/utils`, `packages/rpc`, and `packages/create-proxy-app` are existing utility, RPC, and scaffolding packages.
- `rspack.config.ts` builds the existing Scramjet bundles and is not currently a RefractJS build configuration.

No database integration was found in the repository paths inspected. The legacy demo's static serving and proxy routing remain owned by its existing Vite configuration and Scramjet runtime.

## RefractJS Request Path

```text
Request -> Refract URL resolver -> bounded scheduler -> HTTP cache -> Fetch transport -> allowlisted origin
```

The working code is under `packages/refract-*`. The core resolves URLs, rejects origins absent from its configured allowlist, schedules by origin with global/per-origin limits and priority aging, consults a bounded LRU memory cache, and calls the transport. Identical credential-free GET/HEAD requests can share an in-flight operation. Cache entries are isolated by an explicit `cachePartition` for private or credentialed content.

The Fetch transport is a real HTTP transport, not Wisp. It restricts requests to explicitly configured HTTP(S) origins, refuses URL credentials, does not automatically follow redirects, limits uploads and buffered response size, and supports AbortSignal and timeout handling. This is not sufficient SSRF protection for an exposed gateway: DNS resolution is not pinned, authenticated gateway sessions do not exist, and callers must keep the allowlist under trusted administrative control.

The Refract rewriter currently provides standards-based URL resolution only. HTML/CSS/JavaScript rewriting, proxy URL encoding, service-worker routing, and browser integration remain unimplemented; the config keeps content rewriting disabled instead of claiming otherwise.

## Original Component Classification

| Component | Class | Current disposition |
| --- | --- | --- |
| `packages/core/src`, `packages/core/rewriter` | A: original Scramjet runtime and rewrite engine | Retained unchanged; not imported by RefractJS. Replacement is incomplete, so deletion is unsafe. |
| `packages/controller` | A: Scramjet browser controller and service-worker orchestration | Retained unchanged for the legacy demo. RefractJS has no replacement yet. |
| `packages/bootstrap` | A: Scramjet bootstrap and transport selection | Retained unchanged for the legacy workflow. |
| `packages/demo` | A: Scramjet-specific UI and test playground | Retained unchanged; no RefractJS UI has been added. |
| `packages/runway` | A: Scramjet compatibility and browser test suite | Retained as legacy validation, not a RefractJS compatibility claim. |
| `packages/utils`, `packages/rpc`, `packages/create-proxy-app` | A: existing proxy-specific utilities/scaffolding | Retained; independence and replacement assessment remains outstanding. |
| `devserver.ts`, `rspack.config.ts`, root `pnpm dev` | B: build/development infrastructure coupled to the legacy app | Retained to preserve working startup. RefractJS does not use this as its engine entry point. |
| pnpm workspace and TypeScript tooling | B: general repository infrastructure | Retained and extended for RefractJS packages. |
| Wisp protocol implementation | C: external transport dependency | Retained only for the legacy dev server/bootstrap packages; not imported by the RefractJS runtime. Its package is AGPL-3.0. |
| Request scheduling, cache policy, URL resolution, proxy routing, browser interception, transport lifecycle | D: functionality RefractJS must implement independently | Scheduler/cache/Fetch request path and URL resolution have initial working implementations; browser/proxy features remain open. |

No original Scramjet source file was deleted during this migration. The removed placeholder transport folders were newly-created fabricated adapters, not upstream code.

## Independence Boundary

The RefractJS packages do not depend on `@mercuryworkshop/scramjet`, its controller, or its proxy transport interface. Wisp remains in the monorepo because the legacy application uses it, but it is not part of the RefractJS request pipeline. The RefractJS transport contract is independently declared under `@refractjs/refract-transports`.

## Milestone Status

Implemented: shared contracts, standardized `REFRACT_E_` errors, `refract_` counters, URL resolution, allowlisted Fetch transport, bounded fair scheduler, memory cache with conservative HTTP freshness rules and validator revalidation, private cache partitioning, cancellation, timeout, and a local HTTP integration test.

Not implemented: browser interception, proxy gateway, HTML/CSS/JS rewriting, Wisp client integration, disk cache, service-worker controller, authenticated sessions, DNS pinning/rebinding protection, compatibility suite, production observability, load testing, and reproducible performance benchmarks.

## Workspace Relocation

The active editor and dev container currently mount this repository at `/workspaces/scramjet`. Renaming that mount while VS Code is using it can orphan the active workspace and its terminal cwd. After closing the workspace/container, rename from a separate terminal and reopen the new path:

```sh
mv /workspaces/scramjet /workspaces/refractjs
code /workspaces/refractjs
```

No source file currently embeds `/workspaces/scramjet`; package paths are relative. The rename is therefore an environment operation, not a source-code migration.
