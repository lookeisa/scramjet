# Fractal Advantage Roadmap

**Status:** Research proposal, 2026-11-04. This is a ranked engineering sequence, not a claim that Fractal currently has these capabilities. No rewrite, protocol, transport, or benchmark work is started by this document.

## Ranking

Ratings are engineering judgment from the inspected source and standards, not measured product results. Impact uses 1 (low) to 5 (high); complexity uses S/M/L/XL. Performance impact describes potential, not a guaranteed win.

| Rank | Priority | Opportunity                                        | User impact | Performance impact | Compatibility impact | Complexity | Security implications                                  | Measurability                                       |
| ---- | -------- | -------------------------------------------------- | ----------: | -----------------: | -------------------: | ---------- | ------------------------------------------------------ | --------------------------------------------------- |
| 1    | P0       | Authenticated destination boundary and DNS pinning |           5 |                  1 |                    3 | L          | Critical risk reducer; prerequisite to exposure        | High: deterministic resolver/redirect tests         |
| 2    | P0       | Independent parser-based rewrite pipeline          |           5 |                  3 |                    5 | XL         | High: transformation policy can weaken origin controls | High: fixtures, browser tests, CPU/memory profiles  |
| 3    | P0       | Browser runtime and explicit origin/scope model    |           5 |                  2 |                    5 | XL         | Critical: isolation and interception boundary          | High: Playwright request/realm assertions           |
| 4    | P0       | Compatibility and performance lab baseline         |           4 |                  4 |                    5 | L          | Medium: catches policy regressions                     | High: pinned browser, fixtures, raw artifacts       |
| 5    | P1       | Module graph, import maps, workers                 |           5 |                  2 |                    5 | L          | High: code-loading and worker-origin boundaries        | High: module/worker conformance fixtures            |
| 6    | P1       | Streaming, backpressure, global memory budgets     |           4 |                  5 |                    3 | L          | High: resource-exhaustion control                      | High: RSS, throughput, cancellation under load      |
| 7    | P1       | PRISM specification and reference transport        |           4 |                  3 |                    3 | L          | High: framing/auth/cancellation contracts              | High: conformance and JSON/binary benchmarks        |
| 8    | P1       | Standards-aware cache and tenant isolation         |           4 |                  3 |                    3 | M/L        | Critical: cross-user confidentiality                   | High: RFC vectors, partition tests, hit-rate traces |
| 9    | P2       | Measured scheduler and transport selection         |           3 |                  4 |                    3 | M/L        | Medium: quotas and fairness must remain enforceable    | High: workload matrix and p95/failure reports       |
| 10   | P2       | Operational diagnostics and verified demo          |           4 |                  2 |                    3 | M          | High: avoid leaking credentials/headers                | High: telemetry contract tests and browser evidence |

## Ranked Work Items

### 1. Authenticated Destination Boundary and DNS Pinning — P0

- **Problem:** Fractal's current Fetch transport checks allowlisted origins and literal private/loopback addresses, but does not resolve and pin DNS answers; it has no gateway authentication. Redirects are returned manually.
- **Why:** hostname allowlisting does not bind a connection to a safe IP, and redirect destinations can differ from the original URL. The current runtime is not safe for public relay exposure.
- **Architecture:** put a policy-enforcing gateway in front of transport execution. Authenticate the user, resolve A/AAAA, reject disallowed/reserved destinations, connect to the validated address, preserve the intended Host/TLS name, and repeat policy at every redirect hop.
- **Required implementation:** destination-policy interface, trusted DNS/connection adapter, redirect state machine, per-user identity/quotas, safe header allowlist, audit events.
- **Tests:** unit vectors for IPv4/IPv6 ranges and URL normalization; controlled DNS rebinding fixture; redirect-to-private fixture; authentication, cross-user cache and cookie isolation; timeout and cancellation tests. Do not probe third-party networks.
- **Measurements:** resolver/connection overhead, policy rejection latency, redirect-hop cost, p95 under concurrent authorized requests.
- **Acceptance:** every connected IP is validated at connect time; every redirect is re-authorized; unauthenticated traffic is rejected; private/metadata/link-local/loopback destinations fail closed by default; no cross-tenant response reuse.

### 2. Independent Parser-Based Rewrite Pipeline — P0

- **Problem:** Fractal's rewriter only resolves URLs; it does not transform content. Scramjet's inspected HTML and JS stages demonstrate the breadth of the problem, while its CSS regex path and expected-failure tests illustrate cases Fractal should explicitly test.
- **Why:** rewriting is coupled to parsing, source identity, browser-visible values, module resolution, and runtime hooks. Regex substitution cannot model full HTML/CSS/JS grammars reliably.
- **Architecture:** content detection → streaming/parser boundary → document/AST analysis → ordered transformations → URL/runtime integration → output and diagnostics. Keep HTML, CSS, JS, and URL policy separate behind a shared request context.
- **Required implementation:** maintained HTML5 parser/tree builder, CSS token/value parser, maintained JS parser with AST passes, transformation provenance, source locations, stable diagnostics, feature flags that remain disabled until complete.
- **Tests:** parser fixtures for malformed/large HTML, comments/escapes in CSS, modern syntax and shadowing in JS, static/dynamic imports, byte-for-byte unchanged cases, differential browser assertions.
- **Measurements:** parse/transform time, output bytes, allocation/peak memory, first rewritten chunk, throughput by input size and language.
- **Acceptance:** each transform has unit and browser tests; unsupported syntax fails explicitly or passes through without unsafe partial mutation; no Scramjet transformation implementation is imported or copied.

### 3. Browser Runtime and Explicit Origin/Scope Model — P0

- **Problem:** Fractal has no browser runtime, service worker, proxy URL format, or page integration. Service workers are origin/scope constrained and cannot act as an arbitrary browser-wide interceptor.
- **Why:** the proxy origin is not the remote origin. Runtime APIs, workers, cookies, navigation, and service-worker control all depend on the distinction.
- **Architecture:** specify deployment origin, encoded destination identity, top-level and nested frame behavior, controller lifecycle, worker bootstrap, error channel, and navigation contract before implementation.
- **Required implementation:** a narrowly scoped service-worker/controller prototype, address/navigation shell only after actual request path exists, lifecycle recovery, module/worker bootstrap, explicit CSP/SRI policy.
- **Tests:** secure-context registration, scope boundaries, two isolated remote origins, nested frames, reload/update, worker-origin values, browser restarts, user-gesture and history navigation.
- **Measurements:** initialization and first-navigation time, controller startup, request handoff overhead, memory per controlled client.
- **Acceptance:** only controlled URLs are intercepted; runtime ownership and origin are observable; multiple remote origins do not share cookies/storage/cache; lifecycle failures recover without silently escaping the proxy path.

### 4. Compatibility and Performance Lab Baseline — P0

- **Problem:** there are no Fractal browser or site compatibility results and no equivalent Scramjet comparison measurements. README site lists and passing unit tests are not compatibility evidence.
- **Why:** without fixed workloads and browser conditions, changes cannot be attributed and speed/compatibility claims are not falsifiable.
- **Architecture:** a versioned test manifest, deterministic local fixtures first, Playwright browser matrix, machine-readable results, separate unit/conformance/site/benchmark gates.
- **Required implementation:** tests for HTML/CSS/JS, navigation, forms, modules, workers, cookies, redirects, cancellation, and unsupported APIs; fixture server; capture logs/screenshots/network traces with sensitive values redacted.
- **Tests:** repeat each deterministic fixture; ensure expected failures are explicit; test same workload against Scramjet and Fractal only when both can run under equal settings.
- **Measurements:** median/p95, CPU, RSS, failures, startup, first content, request counts, cache state, browser/version, network RTT and throughput.
- **Acceptance:** every result has environment/configuration and evidence; unknowns remain `NOT TESTED`; no homepage-only result is labeled full-site pass.

### 5. Module Graph, Import Maps, and Workers — P1

- **Problem:** module URL identity, import-map scopes, dynamic imports, and module workers are known gaps in the inspected Scramjet test ledger; Fractal has no implementation yet.
- **Why:** module resolution is browser-defined and context-sensitive; `import.meta.url`, import maps, worker module graphs, and nested URLs must agree.
- **Architecture:** AST module-specifier transformation plus standards-based import-map resolution and a stable remote module URL identity; worker bootstrap shares the resolver but keeps worker global semantics.
- **Required implementation:** static/dynamic imports, export-from, scopes/import maps, import attributes, `import.meta.url`/`resolve`, module workers, shared workers, and nested dependency tracking.
- **Tests:** browser fixtures for ordering, map scopes, relative and bare specifiers, cycles, module workers with imports, error locations, and sibling WASM/locale assets.
- **Measurements:** graph resolution overhead, module startup and cache reuse, bytes and CPU per transformed module.
- **Acceptance:** browser output URLs expose no proxy internals; module identity and import-map resolution match the browser for the supported subset; unsupported cases are explicit.

### 6. Streaming, Backpressure, and Global Memory Budgets — P1

- **Problem:** Fractal Fetch assembles response chunks into a full `Uint8Array`; with 64 default active requests and 25 MiB per response, payload ceilings alone permit roughly 1.56 GiB in-flight before intermediate copies and runtime overhead.
- **Why:** per-request caps do not bound aggregate concurrent memory; parsers and cache copies add further buffers.
- **Architecture:** stream-capable transport response contract, byte-budget semaphore, bounded queues between network/parser/output, abort propagation, and pass-through for unrewritten large binary resources.
- **Required implementation:** aggregate request/response byte accounting, stream reader cancellation, incremental HTML processing where semantics permit, explicit fallback for non-streamable transformations.
- **Tests:** slow consumer, early disconnect, simultaneous near-limit responses, oversized chunked response, stalled origin, scheduler saturation, memory recovery after abort.
- **Measurements:** RSS/heap high-water mark, throughput, time-to-first-byte/chunk, cancellation latency, GC pauses.
- **Acceptance:** configured aggregate memory budget is never exceeded in stress fixtures; every abort releases buffers/slots; large resources do not require multiple full-size copies without an explicit bounded fallback.

### 7. PRISM Specification and Reference Transport — P1

- **Problem:** Fractal has no protocol; adding transports before defining request identity, cancellation, streaming, errors, and security would create incompatible adapters.
- **Why:** protocol overhead and behavior affect every core request. JSON versus binary encoding is a measurement question, not an assumption.
- **Architecture:** versioned frames, typed request/response metadata, correlation IDs, lifecycle/error states, cancellation, streaming/backpressure, capability negotiation, authentication binding, transport-neutral core contract.
- **Required implementation:** normative spec, reference Fetch-compatible transport, parser/serializer, compatibility vectors, fuzz-safe length handling, trace hooks, version negotiation.
- **Tests:** round-trip and malformed-frame tests, cancellation races, stream flow control, version mismatch, auth separation, cross-transport conformance.
- **Measurements:** JSON and candidate binary encodings on representative headers/bodies; bytes, encode/decode CPU, allocations, latency, throughput.
- **Acceptance:** reference transport is in the real Fractal request path; every message has bounded lengths and explicit errors; a new adapter passes the same conformance suite before being advertised.

### 8. Standards-Aware Cache and Tenant Isolation — P1

- **Problem:** Fractal's initial cache is process-local, memory-only, and conservative; it rejects `Vary` responses rather than modeling variants and accepts caller-provided partition labels.
- **Why:** cache correctness and confidentiality depend on request dimensions, validators, freshness, and trusted identity. A fast cache that mixes tenants is a regression.
- **Architecture:** RFC 9111 policy layer, server-derived tenant partition, explicit cache admission/revalidation, separate shared/public and private namespaces, bounded global/per-tenant storage.
- **Required implementation:** variant key support or explicit conservative rejection, correct 304 merge/freshness updates, mutation invalidation, diagnostics, eviction accounting.
- **Tests:** RFC-derived vectors for `Vary`, freshness, `Age`, `no-store`, `private`, validators; cross-tenant cookies/auth; concurrent coalescing; cache clear/close.
- **Measurements:** hit ratio, byte hit ratio, revalidation rate, latency saved, CPU, bytes retained, tenant skew.
- **Acceptance:** no private response is reused across server-authenticated identities; every cache decision is traceable; behavior matches documented supported RFC subset.

### 9. Measured Scheduler and Transport Selection — P2

- **Problem:** Fractal's scheduler is bounded and fair by origin but uses fixed limits; no workload data justifies adaptive concurrency or transport switching yet.
- **Why:** latency, bandwidth, server limits, and browser transport behavior vary. Increasing concurrency can worsen tail latency and memory.
- **Architecture:** retain explicit per-tenant/global limits; add observable queue wait and transport capabilities; allow policy-based selection only from verified capability/health signals.
- **Required implementation:** workload telemetry, fair priority policy, load-shed behavior, transport lifecycle and retry rules; no fake protocol adapters.
- **Tests:** origin starvation, priority aging, cancellation storms, overloaded transports, retry idempotency, multi-tenant fairness.
- **Measurements:** p50/p95 wait and completion time, throughput, error rate, CPU/RSS, origin concurrency, connection reuse.
- **Acceptance:** changes improve a named workload without violating budgets or fairness; revert when measured regressions exceed agreed thresholds.

### 10. Operational Diagnostics and Verified Demo — P2

- **Problem:** the current demo is legacy Scramjet; Fractal has no browser-facing diagnostics and no real runtime measurements to display.
- **Why:** users and engineers need to distinguish engine failures from origin, browser, transport, and policy limitations.
- **Architecture:** after runtime integration, build a functional browser shell backed by real events/counters, redacted request inspector, compatibility results with evidence links, and benchmark metadata.
- **Required implementation:** version/transport/protocol status, request/error/cache events, navigation timing, resource timing, memory where available, safe log redaction.
- **Tests:** values must trace to engine events; verify no cookies, credentials, authorization headers, or sensitive query values are exposed; test empty/error/unsupported states.
- **Measurements:** diagnostics overhead and event volume; compare displayed metrics to browser/network traces.
- **Acceptance:** no hardcoded PASS/statistics; every compatibility entry links to a dated run; dashboard is disabled or clearly `NOT TESTED` when no evidence exists.

## First Three Implementation Tasks

1. **Destination-policy design and local security tests:** specify the trusted resolver/connection boundary and redirect authorization contract, then add deterministic tests before exposing any gateway.
2. **Rewriter interface and fixture corpus:** define typed HTML/CSS/JS transformation inputs, URL context, diagnostics, and unchanged-input rules; select parsers only after compatibility, license, bundle-size, and throughput evaluation.
3. **Browser compatibility harness for Fractal:** start with same-origin navigation, URL resources, modules/import maps, workers, cookies, cancellation, and error reporting. Record machine/browser conditions and keep all unimplemented capabilities `NOT TESTED`.

These are proposals only. No large architectural rewrite or protocol implementation should begin until the architecture and acceptance contracts are reviewed and approved.
