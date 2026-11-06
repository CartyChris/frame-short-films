#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --release --manifest-path companion/Cargo.toml --locked
mkdir -p src-tauri/resources
cp companion/target/release/frame-companion src-tauri/resources/frame-companion
bash scripts/build-wasm.sh
npm run build
