# Development and Verification

## Verified Environment

The toolchain below was verified on Ubuntu 24.04, x86_64, on 2026-10-31:

| Tool | Version/configuration |
| --- | --- |
| Node.js | 24.22.2 (CI selects major version 24) |
| pnpm | 10.12.1 (`packageManager` in the root manifest) |
| Rust channel | `nightly-2026-10-31` |
| rustc | 1.101.0-nightly, commit `92b5b8c87c61b20adc9001b41baf587634a74734` |
| Cargo | 1.101.0-nightly, commit `31d3246e0` |
| Rust components | `rust-src`; host `x86_64-unknown-linux-gnu` |
| Rust target | `wasm32-unknown-unknown` |
| wasm-bindgen-cli | 0.2.105 (also pinned by the Cargo lockfile and CI) |
| Binaryen / wasm-opt | 133; x86_64 Linux archive SHA-256 `2dc9c7813f5375db93d96ead4b78222fcc3e2677bbb832297af4797782a37489` |
| wasm-snip | 0.4.0 at commit `e9c9e133f15f3b9849704c653b87cb12067e629f` |

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

## Refract Gate

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
```

`legacy:types` checks root and legacy package TypeScript configs, reports all diagnostics, and exits nonzero when any config fails. The current gate fails 10 configurations with 273 diagnostics (overlapping diagnostics occur in packages with multiple configs). The errors are in original Scramjet/controller/demo/scaffolder/utils/RPC and root files or their declaration dependencies; those implementation sources were not changed by the Refract work. Core declaration generation reports 20 errors in `tsconfig.types.json`, while the inherited Rspack plugin logs and swallows that compiler exit. The bundler build and package-validation gate nevertheless complete. Use `pnpm legacy:types` to distinguish a bundle build pass from a clean type declaration pass.

`pnpm verify:workspace` runs Refract build/tests/types, all named legacy builds, package validation, and then the legacy type gate. Until the untouched legacy type errors are resolved, this full gate is expected to return nonzero at its final step; it does not mark the repository healthy merely because Refract passes.

## Verified Results and Remaining Limitations

On 2026-10-31, the pinned production rewriter build generated a valid 583,584-byte `packages/core/dist/scramjet.wasm` with SHA-256 `2984ba4b66a541c4366f29a89d80560f81b284b1092ff3c6f1353b8ccf8671d1`; Binaryen parsed and re-emitted the generated module, and the distribution bytes matched `wasm/out/optimized.wasm`. `pnpm build` for Scramjet core completed, the recursive workspace build completed, and `pnpm test:package` passed 4/4 checks. Refract builds, 13 tests, and all five package typechecks passed.

The legacy declaration gate remains failing and requires separate source-level repairs. The Refract Fetch transport still does not pin DNS results, provide a gateway/session authentication layer, or implement browser document rewriting. No website compatibility or comparative performance benchmarks have been run.
