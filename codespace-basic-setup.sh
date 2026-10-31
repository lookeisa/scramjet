#!/bin/bash
set -euo pipefail

REFRACT_TOOLS="${REFRACT_TOOLS:-$HOME/.refract-tools}"
RUSTUP="$HOME/.cargo/bin/rustup"
mkdir -p "$REFRACT_TOOLS/cargo-tools" "$REFRACT_TOOLS/binaryen-133"

if [[ ! -x "$RUSTUP" ]]; then
	RUSTUP_INIT="$(mktemp)"
	curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o "$RUSTUP_INIT"
	RUSTUP_VERSION=1.29.2 sh "$RUSTUP_INIT" --yes --no-modify-path --default-toolchain none --profile minimal
	rm -f "$RUSTUP_INIT"
fi

export PATH="$HOME/.cargo/bin:$PATH"
rustup toolchain install nightly-2026-10-31 --profile minimal --component rust-src --target wasm32-unknown-unknown

pnpm install
cargo +nightly-2026-10-31 install wasm-bindgen-cli --version 0.2.105 --locked --force --root "$REFRACT_TOOLS/cargo-tools"
cargo +nightly-2026-10-31 install wasm-snip --git https://github.com/r58playz/wasm-snip --rev e9c9e133f15f3b9849704c653b87cb12067e629f --locked --force --root "$REFRACT_TOOLS/cargo-tools"

curl -fsSL https://github.com/WebAssembly/binaryen/releases/download/version_133/binaryen-version_133-x86_64-linux.tar.gz -o /tmp/binaryen-version_133-x86_64-linux.tar.gz
printf '%s  %s\n' '2dc9c7813f5375db93d96ead4b78222fcc3e2677bbb832297af4797782a37489' /tmp/binaryen-version_133-x86_64-linux.tar.gz | sha256sum -c -
tar -xzf /tmp/binaryen-version_133-x86_64-linux.tar.gz -C "$REFRACT_TOOLS/binaryen-133"

export PATH="$REFRACT_TOOLS/cargo-tools/bin:$REFRACT_TOOLS/binaryen-133/binaryen-version_133/bin:$PATH"
cd packages/core
RELEASE=1 pnpm rewriter:build
pnpm build
cd ../..
pnpm test:package
pnpm refract
