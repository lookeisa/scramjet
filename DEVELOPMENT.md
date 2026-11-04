# Development and Verification

## Verified Environment

The toolchain below was verified on Ubuntu 24.04, x86_64, on 2026-10-31:

| Tool                | Version/configuration                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Node.js             | 24.22.2 (CI selects major version 24)                                                                |
| pnpm                | 10.12.1 (`packageManager` in the root manifest)                                                      |
| Rust channel        | `nightly-2026-10-31`                                                                                 |
| rustc               | 1.101.0-nightly, commit `92b5b8c87c61b20adc9001b41baf587634a74734`                                   |
| Cargo               | 1.101.0-nightly, commit `31d3246e0`                                                                  |
| Rust components     | `rust-src`; host `x86_64-unknown-linux-gnu`                                                          |
| Rust target         | `wasm32-unknown-unknown`                                                                             |
| wasm-bindgen-cli    | 0.2.105 (checked by the build script and pinned in CI; the Rust crate is locked separately)          |
| Binaryen / wasm-opt | 133; x86_64 Linux archive SHA-256 `2dc9c7813f5375db93d96ead4b78222fcc3e2677bbb832297af4797782a37489` |
| wasm-snip           | 0.4.0 at commit `e9c9e133f15f3b9849704c653b87cb12067e629f`                                           |

The repository previously specified only a floating `nightly` channel, Binaryen `latest`, and an unpinned wasm-snip branch. The current tool versions above were selected from the successful build and are now pinned in the toolchain file and CI setup. `wasm-opt` is required for release (`RELEASE=1`) builds; debug WASM generation does not invoke it. `cargo`, wasm-bindgen, and wasm-snip are required for both modes.

## User-Local Tool Installation

The following installs rustup without editing shell profiles, installs project tools under a dedicated directory, and verifies the Binaryen archive before extraction. The official rustup bootstrap script should be downloaded and inspected before executing it.

```sh
export REFRACT_TOOLS="$HOME/.refract-tools"
mkdir -p "$REFRACT_TOOLS/cargo-tools" "$REFRACT_TOOLS/binaryen-133"

curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o /tmp/rustup-init.sh
RUSTUP_VERSION=1.29.2 sh /tmp/rustup-init.sh --yes --no-modify-path --default-toolchain none --profile minimal
"$HOME/.cargo/bin/rustup" toolchain install nightly-2026-10-31 --profile minimal --component rust-src --target wasm32-unknown-unknown

"$HOME/.cargo/bin/cargo" +nightly-2026-10-31 install wasm-bindgen-cli --version 0.2.105 --locked --force --root "$REFRACT_TOOLS/cargo-tools"
"$HOME/.cargo/bin/cargo" +nightly-2026-10-31 install wasm-snip --git https://github.com/r58playz/wasm-snip --rev e9c9e133f15f3b9849704c653b87cb12067e629f --locked --force --root "$REFRACT_TOOLS/cargo-tools"

curl -fsSL https://github.com/WebAssembly/binaryen/releases/download/version_133/binaryen-version_133-x86_64-linux.tar.gz -o /tmp/binaryen-version_133-x86_64-linux.tar.gz
printf '%s  %s\n' '2dc9c7813f5375db93d96ead4b78222fcc3e2677bbb832297af4797782a37489' /tmp/binaryen-version_133-x86_64-linux.tar.gz | sha256sum -c -
tar -xzf /tmp/binaryen-version_133-x86_64-linux.tar.gz -C "$REFRACT_TOOLS/binaryen-133"

export PATH="$REFRACT_TOOLS/cargo-tools/bin:$REFRACT_TOOLS/binaryen-133/binaryen-version_133/bin:$HOME/.cargo/bin:$PATH"
rustc +nightly-2026-10-31 -Vv
cargo +nightly-2026-10-31 -V
wasm-bindgen --version
wasm-snip --version
wasm-opt --version
```

The CI composite action installs the same pinned toolchain and CLI versions. The Binaryen action is pinned to version 133 rather than its moving default.

## Legacy Build Order

From the repository root:

```sh
pnpm install
cd packages/core
pnpm rewriter:build
pnpm build
cd ../..
pnpm test:package
```

For the optimized/release WASM path used by package prepack:

```sh
cd packages/core
RELEASE=1 pnpm rewriter:build
pnpm build
cd ../..
pnpm test:package
```

`rewriter:build` compiles the Rust `wasm` crate from `packages/core/rewriter/wasm/src` and its `js`, `transform`, and `coverage-macro` workspace dependencies. wasm-bindgen generates `wasm/wasm.d.ts`, `wasm/wasm.js`, `wasm/wasm_bg.wasm`, and `wasm/wasm_bg.wasm.d.ts`; wasm-snip and, for release builds, wasm-opt produce `wasm/optimized.wasm`; the final WASM is copied to `packages/core/dist/scramjet.wasm`. The Rspack build then embeds that file and emits JavaScript bundles, maps, and declarations. The package-validation test checks those outputs.

Generated `target`, `wasm/out`, `dist`, and `lib` outputs are ignored by repository rules and were not added to Git.

## Fractal Gate

The package manifests are `@refractjs/refract-core`, `@refractjs/refract-rewriter`, `@refractjs/refract-shared`, `@refractjs/refract-transports`, and `@refractjs/refract-transport-fetch`.

```sh
pnpm refract:build
pnpm refract:test
pnpm refract:check
pnpm refract
```

`pnpm refract` builds each package to `dist`, runs tests against the compiled package exports, and typechecks all five packages. No proxy/browser rewriting capability is implied by these checks.

## Legacy and Full-Workspace Gates

```sh
pnpm legacy:build
pnpm test:package
pnpm legacy:types
pnpm verify:workspace
pnpm verify
```

`legacy:types` checks root and legacy package TypeScript configs, reports all diagnostics, and exits nonzero when any config fails. On 2026-11-04, all 11 configurations passed after correcting the current core type errors. Run this command after changes because legacy diagnostics can vary with the installed dependency and TypeScript versions.

`pnpm legacy:build` first runs the legacy WASM rewriter build, then builds the legacy packages. `pnpm verify:workspace` runs Fractal package builds/tests/types, the example app typecheck and integration suite, all named legacy builds, package validation, and the legacy type gate. `pnpm verify` is an alias for the full workspace gate.

## Fractal Example Application

The loopback-only example at `apps/example-app` exercises the Fractal Core public API and Fetch transport against its controlled local fixture. It does not provide general website proxying or HTML/JS rewriting.

```sh
pnpm example
pnpm example:check
pnpm example:test
```

`pnpm example` builds Fractal packages and starts the app at `http://127.0.0.1:3000` with its local fixture on port 3001. Both bind to loopback. The app allows only fixed fixture routes and revalidates every redirect; do not expose it as a public proxy. The browser test requires Playwright Chromium and its Linux system libraries; a skipped browser test is not browser compatibility evidence. The example's detailed request path and limitations are documented in `apps/example-app/README.md`.

## Verified Results and Remaining Limitations

On 2026-10-31, the pinned production rewriter build generated a valid 583,584-byte `packages/core/dist/scramjet.wasm` with SHA-256 `2984ba4b66a541c4366f29a89d80560f81b284b1092ff3c6f1353b8ccf8671d1`; Binaryen parsed and re-emitted the generated module, and the distribution bytes matched `wasm/out/optimized.wasm`.

On 2026-11-04, the main worktree passed `pnpm verify` with the example app included: 13 Fractal tests, all five Fractal package typechecks, 13 example unit/integration/browser tests, 4/4 package-validation tests, legacy builds, and all 11 legacy/root type configurations. Chromium's shared libraries were missing from the container; the browser was run using libraries downloaded and extracted under `/tmp` with a command-local `LD_LIBRARY_PATH`, without system installation. The pinned Rust/WASM tools were also absent from the default `PATH`; adding them to a command-local `PATH` resolved that environment issue.

A detached validation worktree at `HEAD` verified a frozen-lockfile install from an empty `node_modules` tree (690 packages), `pnpm refract` (13/13 tests), and a fresh `RELEASE=1` WASM build through Binaryen followed by the Scramjet bundle build and `pnpm test:package` (4/4). pnpm reported ignored install scripts for `bufferutil`, `core-js`, and `esbuild`; the listed builds and tests still passed. That detached worktree does not contain the main worktree's unstaged core TypeScript fixes, so its legacy type gate retains the five baseline core diagnostics; the current main worktree gate passes all 11 configurations.

The Fractal Fetch transport still does not pin DNS results, provide a gateway/session authentication layer, or implement browser document rewriting. No website compatibility or comparative performance benchmarks have been run.
