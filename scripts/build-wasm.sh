#!/usr/bin/env bash
set -euo pipefail
FRAME_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cargo build --manifest-path "$FRAME_ROOT/crates/film-core/Cargo.toml" --release --target wasm32-unknown-unknown
mkdir -p "$FRAME_ROOT/public"
cp "$FRAME_ROOT/crates/film-core/target/wasm32-unknown-unknown/release/film_core.wasm" "$FRAME_ROOT/public/film_core.wasm"
