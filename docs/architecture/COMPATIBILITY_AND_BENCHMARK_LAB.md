# Compatibility and Benchmark Lab

**Status:** proposed methodology only. No comparative performance or general-site compatibility result is produced here. The local fixture is not a proxy compatibility score.

## Evidence and Result States

Each case records one state: `PASS`, `PARTIAL`, `FAIL`, or `NOT TESTED`. Every non-`NOT TESTED` result stores browser/build versions, date, exact fixture/site and steps, engine/config versions, route through the engine, logs, network trace, screenshot/video where useful, and failure evidence. Redact cookies, auth headers, tokens, and sensitive query values.

Pass means every assertion in that named test passed under its exact conditions. It does not mean the whole site or feature family works. A homepage visibility assertion is not a YouTube playback pass. Do not convert an expected failure list, static source review, skipped browser test, or green package build into a browser compatibility result.

## Test Environment

- Pin browser binary/version and launch flags; record Playwright version, OS/kernel, CPU model/core count, memory limit, Node/Rust versions, and Fractal/Scramjet revisions.
- Use one physical/virtual machine and one browser profile policy for paired comparisons. Run serially unless the workload explicitly measures concurrency.
- For local deterministic cases, use the same local origin fixture, response bytes, certificates, and request sequence. For public sites, use approved test accounts, same egress/network and time window; do not bypass authentication, access controls, or DRM.
- Define cold-cache and warm-cache runs separately; clear or prepopulate cache identically. Record DNS state and negotiated HTTP protocol when measurable.
- Keep raw Playwright traces, HAR (redacted), console/page errors, screenshots, metrics JSON, and a run manifest. Hash fixtures and preserve benchmark scripts.
- Warm up 3 times, then run at least 20 measured iterations per deterministic benchmark case; report sample count, median, p95, min/max, and confidence/variance. Public-site runs are observational and must include date/time because the target changes.

## Compatibility Matrix

The matrix starts as required work, not an assertion of support. Current verified local fixture scope is documented separately in the example README.

| Case                                                              | Assertions                                                                                                                                 | Fractal status                                                                                                                                                     | Scramjet status                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Controlled HTML/CSS/JS/SVG/JSON fixture through Fractal transport | Browser DOM render, CSS computed style, script interaction, image dimensions, fetch result, app-origin route, exact transport event count. | Browser test passed when Chromium was launched with temporary libraries during this milestone; app frame contains only controlled fixture, no general proxy claim. | Not the same runtime/workload yet.                                                         |
| Static HTML attributes/forms/navigation                           | DOM semantics, base URL, method/target, request route, browser-visible values.                                                             | NOT TESTED                                                                                                                                                         | Runway cases exist; record per case by current run, not source presence.                   |
| CSS parsing and CSSOM                                             | Comments, escapes, nested `url()`, `@import`, fonts, computed style, CSSOM round trips.                                                    | NOT TESTED                                                                                                                                                         | Runway expected failures exist; rerun before comparative claim.                            |
| JavaScript AST/module semantics                                   | Modern syntax, shadowing, import maps/scopes, dynamic import, `import.meta.url`, errors/source maps.                                       | NOT TESTED                                                                                                                                                         | Runway has tests and expected failures; rerun.                                             |
| Workers/service workers                                           | Classic/module/shared workers, nested imports, origin/scope, update/restart, request metadata.                                             | NOT TESTED                                                                                                                                                         | Runway tests/ledger exist; rerun.                                                          |
| SPA/navigation/history                                            | Dynamic route, history push/replace/pop, back/forward/reload, stale-response cancellation.                                                 | Local example history/reload/cancel now covered by Playwright fixture; SPA/site routing NOT TESTED.                                                                | NOT TESTED in paired benchmark.                                                            |
| Cookies/authentication                                            | Secure test account, login/logout, SameSite/redirects, storage/cache isolation.                                                            | NOT TESTED                                                                                                                                                         | Source tests exist; complete journeys NOT TESTED here.                                     |
| WebSockets                                                        | handshake, origin/session auth, messages, reconnect, close, concurrent sessions.                                                           | NOT TESTED                                                                                                                                                         | Local echo tests exist; not run in this milestone.                                         |
| Media/WebRTC/WebTransport                                         | Playback, seek, adaptive segments, subtitles, ICE/relay, transport support, latency.                                                       | NOT TESTED                                                                                                                                                         | Public site claims are not feature-level evidence.                                         |
| CSP/SRI                                                           | Policy enforcement before/after transform, integrity behavior, blocked inline/external scripts.                                            | NOT TESTED                                                                                                                                                         | Source inspection shows legacy policy rewriting choices; no security conformance run here. |
| Public sites (YouTube/Discord/GeForce NOW)                        | Separate flows and evidence per requested feature; no DRM/access-control bypass.                                                           | NOT TESTED                                                                                                                                                         | A public README/site smoke test does not imply full feature PASS.                          |

The current example browser's Playwright case passes when Chromium's runtime libraries are available. In this Codespace, missing libraries were unpacked under `/tmp` and supplied through a command-local `LD_LIBRARY_PATH`; no system packages were installed. Without that environment, the browser test reports a skip, which is a blocker, not a pass.

## Benchmark Workloads

### Navigation and rewriting

- Cold/warm startup; first navigation; first usable DOM signal; navigation completion.
- HTML: 10 KiB, 100 KiB, 1 MiB; simple and malformed fixtures; static and inline resources.
- CSS: 10 KiB, 100 KiB, 1 MiB, nested imports/fonts and escape/comment corpus.
- JavaScript: classic, module graph (1/10/100 modules), dynamic import, worker, 100 KiB/1 MiB/10 MiB payloads.
- Measure parse, transform, generate, response delivery, first rewritten chunk, total time, output bytes, source-map cost, heap/RSS, GC, and failures.

### Networking and cache

- Response size: 1 KiB, 100 KiB, 1 MiB, 25 MiB; fixed body and delayed/chunked streams.
- RTT: local, 20 ms, 80 ms, 200 ms; bandwidth/packet loss controlled by a documented network shaper.
- Concurrency: 1, 6, 32, 64, 128 requests across one and many origins; report queue wait, throughput, fairness, p50/p95, bytes, CPU/RSS, errors, cancellations.
- Redirects: zero, one same-origin, cross-origin allowed, and denied target; record each hop.
- Cache: cold, warm hit, stale ETag/Last-Modified revalidation, no-cache/no-store, private partitions, resource variants.
- Record negotiated HTTP version, DNS/connect/TLS/TTFB where available. Do not assume HTTP/2/3 negotiation or a cache hit is a performance win.

### Site tests

Use separate scripts and reports for YouTube homepage/search/playback/seek/subtitles, Discord UI/auth/WebSocket messaging/voice, and GeForce NOW entry/streaming capabilities. Use authorized test accounts, record geo/network restrictions, and leave unsupported media/DRM capabilities `NOT TESTED`; do not circumvent them. Add representative docs, news, commerce, SPA, worker, and WebSocket sites only with a documented, repeatable interaction.

## Pairing and Statistics

For Fractal versus Scramjet:

1. Pin both revisions and builds; record each runtime and transport configuration. Do not change one engine's caching/rewriting settings to favor it.
2. Use the same browser build, machine, fixture bytes, origin server, network shaper, cache condition, request order, and run count.
3. Randomize run order to reduce thermal/time drift. Separate cold and warm runs; never pool them.
4. Capture navigation timing plus per-request trace, transformed byte counts, request count, CPU, RSS/heap high-water mark, failures, and output correctness.
5. Publish raw summary JSON and scripts. Report medians and p95 with run counts and variance; disclose outliers and configuration differences.
6. Declare a speed win only when correctness passes the same assertions and the measured improvement is repeatable with uncertainty reported. No performance number or claim exists yet.

## CI Tiers and Artifacts

- **PR:** unit/parser fixtures, deterministic local HTTP tests, security allowlist/redirect/cancel tests, short Chromium fixture smoke test when browser libraries exist.
- **Nightly:** cross-browser matrix, large inputs, concurrency/memory workloads, test corpus, flaky reruns; retain traces and reports.
- **Release candidate:** pinned two-engine paired benchmarks and approved public compatibility runs; human review of security/CSP/SRI results.

Every result artifact includes `runId`, timestamp, git SHA, engine revisions, browser version, OS/machine, fixture hashes, network settings, cache state, command, status, metrics, and redacted trace references.
