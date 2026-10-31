# Legacy TypeScript Diagnostic Report

Audit run: 2026-10-31, after the WASM artifact and all legacy distributions were generated. Command: `pnpm legacy:types`. All errors below were present before this cleanup task according to the prior baseline report; no Scramjet TypeScript implementation files were changed before this inventory.

## Per-Configuration Results

| Configuration | Diagnostics | Source / declaration areas | Root cause and minimal correction |
| --- | ---: | --- | --- |
| `tsconfig.json` | 156 | `devserver.ts`; `@types/node` 24.9.0 and 26.0.1 declarations; Rspack dev-server declarations; Rsdoctor SDK declarations | Primarily duplicate ambient Node declarations from multiple installed `@types/node` majors. Also an obsolete `@ts-expect-error`, an Rsdoctor SDK import of `@rsdoctor/types/dist/manifest` that the current pnpm link graph cannot resolve, and Rspack Node server generic incompatibilities. Unify Node declarations to the Node 24 type major, remove the obsolete expectation, and repair the Rsdoctor dependency link/type edge narrowly. |
| `packages/bootstrap/tsconfig.json` | 1 | `packages/bootstrap/src/server.ts` | `@mercuryworkshop/wisp-js/server` is a JavaScript-only entrypoint with no published declarations. Add a narrow local ambient declaration based on the actual exported server API used here; do not broaden it to `any`. |
| `packages/bootstrap/tsconfig.types.json` | 0 | None | Passes. |
| `packages/controller/tsconfig.json` | 19 | `packages/controller/src/index.ts`, `inject.ts`, and `packages/rpc/index.ts` | Four missing Scramjet exports cascade from the absent generated `fetch/index.d.ts`. Two frame constructors default `{}` despite requiring `plugins`. Remaining cookie/inject errors are partly downstream of missing types and partly local unchecked dynamic indexing/encoding. Two unused RPC type aliases are independent diagnostics. |
| `packages/controller/tsconfig.types.json` | 9 | Same controller files plus core declaration inputs | Duplicate/cascading missing exports and frame option issues from the regular controller config; `inject.ts` has two additional type errors. Not a separate runtime defect. |
| `packages/core/tsconfig.json` | 50 | `packages/core/src/client/**`, `fetch/**`, `shared/mime.ts`, `shared/rewriters/**` | Core source typing: `frameElement` is declared as `Element`; Node-only V8 Error properties are not present in the browser lib; `snapshot.ts`'s wrapped Set constructor resolves to a WeakSet-shaped type; `ScramjetRequestMode` is imported from a module that does not export it; byte-array narrowing and BlobPart generic types are incomplete; several older DOM/worker API wrappers conflict with current TypeScript DOM declarations, including absent `WebSocketStream` types and `getFlag`. |
| `packages/core/tsconfig.types.json` | 20 | `client/client.ts`, `client/shared/wrap.ts`, `fetch/headers.ts`, `fetch/index.ts`, `shared/mime.ts`, `shared/rewriters/js.ts`, `shared/rewriters/url.ts` | Same core source issues that are reachable from the declaration entrypoint. In addition, this config explicitly sets `types` to only `@types/serviceworker`, excluding Node declarations required by the V8 stack formatter. The failing fetch barrel prevents `dist/types/fetch/index.d.ts` from being emitted, cascading to consumers. |
| `packages/create-proxy-app/tsconfig.json` | 4 | `packages/create-proxy-app/src/cli.ts`, `scaffold.ts` | `providedName` is undefined in three post-scaffold messages; the existing `cliResults.dir` is the intended fallback. `fs-extra` is directly used but its `@types/fs-extra` declaration package is not declared. Add that exact type dependency. |
| `packages/demo/tsconfig.json` | 10 | `packages/demo/src/App.tsx`, `pages/BrowserView.tsx`, `pages/Playground.tsx`, `pages/RequestViewer.tsx`, `packages/rpc/index.ts` | Six unused imports/locals are strictness errors. Two missing Scramjet exports cascade from the core declaration barrel. The destination string `"empty"` is not a Fetch `RequestDestination`; the web API uses the empty string. RPC aliases are also unused. |
| `packages/utils/tsconfig.json` | 2 | `packages/utils/src/alwaysLastBubble.ts`, `http-cache-plugin.ts` | One generic event listener callback needs a narrow cast at the EventTarget boundary; one missing `ScramjetFetchRequest` export cascades from the core fetch barrel. |
| `packages/utils/tsconfig.types.json` | 2 | Same two utils files | Duplicates the regular utils config diagnostics. |

The 273 total diagnostics are not 273 independent defects. Many repeat across root/package/declaration configs, and the missing fetch barrel causes repeated downstream export errors. The largest common root cause is duplicate Node ambient types; the highest-impact source cascade is the failed core fetch barrel.

## Core Declaration Errors (20)

1. `client/client.ts`: two `frame.name` errors because `frameElement` is typed as `Element`; use its reflected `name` attribute or narrow to supported frame element types.
2. `client/client.ts`: six references to `Error.prepareStackTrace` are missing Node/V8 declarations because `tsconfig.types.json` limits ambient types to serviceworker.
3. `client/shared/wrap.ts`: `Window` does not match the project `GlobalThis` alias; inspect global augmentation and type the browser self reference at its proper boundary.
4. `fetch/headers.ts`: two casts originate from `_Set`'s generic constructor typing in `shared/snapshot.ts`; fix the wrapper's construct signature rather than casting each call site.
5. `fetch/index.ts`: `ScramjetRequestMode` is imported from `parse.ts`, where it is not exported; use the standard `RequestMode` or define the intended narrow alias.
6. `shared/mime.ts`: four `.has(string)` errors are consequences of the wrapped `_Set` constructor type.
7. `shared/rewriters/js.ts`: one missing `Error.stackTraceLimit` V8 type, plus two failures to keep `newjs` narrowed to `string` after decoding.
8. `shared/rewriters/url.ts`: one `Uint8Array<ArrayBufferLike>` is passed as `BlobPart`; create an owned `ArrayBuffer`-backed byte view at this browser API boundary.

The generated declaration directory currently lacks `dist/types/fetch/index.d.ts`, although `dist/types/index.d.ts` re-exports `./fetch`. `fetch/index.ts` contains the missing type import above; correcting that source error should generate the barrel and resolve downstream export diagnostics. The Rspack plugin currently catches TypeScript exit code 2 and reports declaration generation as successful, so `legacy:types` remains the authoritative type gate until the plugin is changed to propagate failures.

## Classification and Decision

- **Pre-existing:** The prior baseline reported these legacy errors before the current task; the implementations listed here were unchanged until this diagnostic report was created.
- **Environment/configuration:** Multiple `@types/node` majors are simultaneously visible in the root program; current Node 24 aligns with pinning the workspace to the Node 24 type line. Rsdoctor's declaration import must be resolved from its declared dependency graph.
- **Generated declaration cascade:** Missing `fetch/index.d.ts` follows the source compile error and causes controller/demo/utils missing-export errors. Do not patch every consumer individually.
- **Genuine legacy source:** Undefined `providedName`, incorrect `RequestDestination`, and unused strict-mode imports are local source defects and can be fixed without runtime behavior changes.
- **Third-party declarations:** Wisp's server entrypoint has no declarations; Rsdoctor SDK references its types package deep path. Use narrow local ambient/dependency corrections, not `skipLibCheck`.
- **Unrelated browser API typing:** `WebSocketStream` and V8 stack APIs are not fully represented by the selected DOM/serviceworker libs. Add narrow declarations only where runtime support is already intentionally used; do not claim new browser support.

No compiler strictness was changed or disabled for this report. The recommended sequence is: unify Node type versions and repair core's fetch barrel; rerun the ten-config report; then fix remaining genuine source issues; finally decide narrowly on third-party declaration boundaries.
