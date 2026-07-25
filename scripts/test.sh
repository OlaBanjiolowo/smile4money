#!/usr/bin/env bash
# Run all test suites: Rust contracts, frontend, and backend.
# Exits with a non-zero code if any suite fails.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "============================================================"
echo " smile4money — full test run"
echo "============================================================"

# ── 1. Rust contract tests ────────────────────────────────────────
echo ""
echo ">>> [1/3] Rust contract tests (cargo test)"
cargo test --manifest-path "$REPO_ROOT/Cargo.toml"
echo "    ✓ Rust tests passed"

# ── 2. Frontend tests ─────────────────────────────────────────────
echo ""
echo ">>> [2/3] Frontend tests (npm test)"
(cd "$REPO_ROOT/apps/frontend" && npm test)
echo "    ✓ Frontend tests passed"

# ── 3. Backend tests ──────────────────────────────────────────────
echo ""
echo ">>> [3/3] Backend tests (npm test)"
(cd "$REPO_ROOT/apps/backend" && npm test)
echo "    ✓ Backend tests passed"

echo ""
echo "============================================================"
echo " All tests passed."
echo "============================================================"
