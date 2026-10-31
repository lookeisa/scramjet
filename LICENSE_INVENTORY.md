# License Inventory

Audit date: 2026-10-31. This inventory is based on the workspace manifests and installed package metadata in this checkout. It covers direct dependencies; the full transitive dependency graph still requires a generated SBOM/license report before distribution.

## Project and RefractJS Packages

The root project and all new `@refractjs/*` packages declare `AGPL-3.0-only`. The root `package.json` also carries this license because AGPL-covered upstream Scramjet code remains in the repository. No root `LICENSE` file is present in this checkout; resolve that packaging gap before distribution. RefractJS has not been relicensed independently.

The RefractJS runtime's package dependencies are internal workspace packages. Its transport uses the platform Fetch API and has no external runtime library dependency. `@types/node` is a development-only dependency under MIT. Root TypeScript tooling is Apache-2.0.

## Retained Upstream and Protocol Components

| Package/component | Version | Declared license | RefractJS use |
| --- | --- | --- | --- |
| `@mercuryworkshop/scramjet` | `2.0.67-alpha.2` | AGPL-3.0-only | Legacy runtime only; not imported by RefractJS. |
| `@mercuryworkshop/scramjet-controller` | `0.0.14` | AGPL-3.0-only | Legacy controller only. |
| `@mercuryworkshop/scramjet-utils` | `0.0.3` | AGPL-3.0-only | Legacy demo only. |
| `@mercuryworkshop/rpc` | `0.0.1` | AGPL-3.0-only | Legacy controller only. |
| `@mercuryworkshop/wisp-js` | `0.4.1` | AGPL-3.0 | Legacy dev server/bootstrap; not imported by RefractJS. |
| `@mercuryworkshop/libcurl-transport` | `2.0.5` | AGPL-3.0-only | Legacy bootstrap/demo/test dependencies only. |
| `@mercuryworkshop/epoxy-transport` | `3.0.1` | AGPL-3.0-only | Legacy bootstrap/demo dependencies only. |
| `@mercuryworkshop/proxy-transports` | `1.0.2` | MIT | Legacy Scramjet transport interface only. |

Scramjet package and transport dependencies remain in the workspace because removing them would break the existing demo and test harness. The RefractJS packages have no import or package dependency on Scramjet runtime/controller APIs.

## Other Direct Dependency License Groups

The following licenses are read from installed package metadata for direct workspace dependencies:

- MIT: `@clack/core`, `@clack/prompts`, `@eslint/eslintrc`, `@eslint/js`, `@fastify/deepmerge`, `@rsdoctor/rspack-plugin`, `@rspack/cli`, `@rspack/core`, `@types/eslint`, `@types/estree`, `@types/express`, `@types/istanbul-lib-coverage`, `@types/node`, `@types/ws`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `ajv`, `ava`, `chalk`, `commander`, `dom-serializer`, `dreamland`, `eslint`, `execa`, `fs-extra`, `giget`, `htmlparser2`, `monaco-editor`, `parse-domain`, `prettier`, `sort-package-json`, `ts-checker-rspack-plugin`, `tsc-alias`, `vite`, `vite-plugin-static-copy`, and `ws`.
- BSD-2-Clause: `domhandler`, `domutils`.
- Apache-2.0: `@types/serviceworker`, `playwright`, `typescript`.
- ISC: `idb`, `tar`, `v8-to-istanbul`.
- BSD-3-Clause: `istanbul-lib-coverage`.
- 0BSD: `tslib`.
- BlueOak-1.0.0: `glob`.
- LGPL-3.0: `chafa-wasm`.

`express` is an MIT-licensed direct dependency in the legacy test harness; the package was not installed in this workspace snapshot. Workspace-generated app templates also name Scramjet packages and must be included in any distribution review.

## AGPL-3.0 Obligations

AGPL-3.0 is a strong copyleft license. Distribution of covered/combined works generally requires preserving notices and providing Corresponding Source under the license terms. Section 13 additionally requires offering source to users who interact remotely with a modified version over a network. The Wisp package itself is AGPL-3.0, while the Scramjet packages declare AGPL-3.0-only. These components are isolated from the RefractJS runtime but remain part of this repository and the legacy development workflow.

This inventory is not legal advice. Before publishing binaries, operating a modified legacy service, or changing the project's license, obtain a complete transitive SBOM and legal review.
