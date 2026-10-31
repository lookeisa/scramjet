# RefractJS

RefractJS is an independent web-request engine under active development. Its current working path is a Node.js HTTP Fetch transport guarded by an explicit origin allowlist, a bounded fair scheduler, and a bounded in-memory HTTP response cache.

The repository still contains the original Scramjet application and runtime as a quarantined legacy system. The existing `pnpm dev` workflow continues to run that application; it does not start RefractJS. See [REFRACT_ARCHITECTURE.md](REFRACT_ARCHITECTURE.md) and [LICENSE_INVENTORY.md](LICENSE_INVENTORY.md) before distributing or deploying any part of this repository.

## Current RefractJS Commands

```sh
pnpm install
pnpm refract:test
pnpm refract:check
pnpm refract
```

The request integration test starts a local HTTP fixture and explicitly allowlists its loopback origin. The default RefractJS configuration has an empty allowlist and denies requests until an application supplies one.

## Current Scope

- `@refractjs/refract-shared` provides request, response, configuration, and standardized error contracts.
- `@refractjs/refract-transports` provides the transport lifecycle contract and metrics.
- `@refractjs/refract-transport-fetch` makes real HTTP requests through the platform Fetch API, enforces an exact origin allowlist, disables automatic redirects, and applies request/response byte limits.
- `@refractjs/refract-rewriter` currently resolves absolute and relative HTTP(S) URLs. HTML, CSS, and JavaScript rewriting are not implemented and are disabled by default.
- `@refractjs/refract-core` runs requests through URL resolution, a bounded per-origin scheduler, memory caching, and the configured transport.

This is not yet a browser proxy or a replacement for the existing application. It has no gateway, service worker, browser controller, or production-ready DNS-rebinding protection. Do not expose it as a public relay.

## Brand

| Token | Color |
| --- | --- |
| Primary blue | `#38BDF8` |
| Secondary violet | `#8B5CF6` |
| Background | `#090D18` |
| Surface | `#101827` |
| Text | `#F8FAFC` |
| Muted text | `#94A3B8` |

The geometric prism concept is a future identity direction; the legacy demo is intentionally unchanged.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for the verified Rust/WASM toolchain, build order, and separate Refract, legacy, and full-workspace gates.

## Licensing

The root project metadata remains `AGPL-3.0-only` because this checkout contains AGPL-covered upstream Scramjet components. See [LICENSE_INVENTORY.md](LICENSE_INVENTORY.md) for the retained packages and obligations. RefractJS has not been relicensed independently.
