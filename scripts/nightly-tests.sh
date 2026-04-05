#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Local Nightly Test Runner
# ─────────────────────────────────────────────────────────────────────────────
# Runs the full test suite locally on the develop branch.
#
# Usage:
#   ./scripts/nightly-tests.sh              # Run all suites
#   ./scripts/nightly-tests.sh packages     # Run packages only
#   ./scripts/nightly-tests.sh api          # Run API only
#   ./scripts/nightly-tests.sh web          # Run web only
#   ./scripts/nightly-tests.sh e2e          # Run e2e only
#
# Cron setup (runs every night at 2 AM):
#   0 2 * * * cd /path/to/cloud && ./scripts/nightly-tests.sh >> /tmp/nightly-tests.log 2>&1
#
# The script writes results to .nightly-results/ and prints a summary.
# ─────────────────────────────────────────────────────────────────────────────

SUITE="${1:-all}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RESULTS_DIR="$ROOT_DIR/.nightly-results"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
RUN_DIR="$RESULTS_DIR/$TIMESTAMP"

mkdir -p "$RUN_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${YELLOW}[nightly]${NC} $*"; }
pass() { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; }

cd "$ROOT_DIR"

# Track results
declare -A RESULTS

run_suite() {
  local name="$1"
  shift
  local logfile="$RUN_DIR/${name}.log"

  log "Running $name..."
  if "$@" > "$logfile" 2>&1; then
    RESULTS[$name]="pass"
    pass "$name passed"
  else
    RESULTS[$name]="fail"
    fail "$name failed — see $logfile"
  fi
}

should_run() {
  [[ "$SUITE" == "all" || "$SUITE" == "$1" ]]
}

# ─── Suites ──────────────────────────────────────────────────────────────────

if should_run "packages"; then
  run_suite "packages" bun run test:cov --filter="./packages/*"
fi

if should_run "api"; then
  run_suite "api-cron" bash -c "cd apps/server/workers && bun run test:cron"
  run_suite "api-unit" bash -c "CLERK_SECRET_KEY=test-mock-clerk-key bun run test:cov --filter='@genfeedai/api'"
fi

if should_run "web"; then
  run_suite "web" bun run test:cov --filter="./apps/app/*"
fi

if should_run "e2e"; then
  run_suite "e2e" bun run test:e2e:core
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
log "═══════════════════════════════════════"
log "  Nightly Test Results — $TIMESTAMP"
log "═══════════════════════════════════════"

FAILED=0
for name in "${!RESULTS[@]}"; do
  if [[ "${RESULTS[$name]}" == "pass" ]]; then
    pass "$name"
  else
    fail "$name"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
log "Logs: $RUN_DIR/"

# Write machine-readable summary
{
  echo "timestamp=$TIMESTAMP"
  echo "suite=$SUITE"
  for name in "${!RESULTS[@]}"; do
    echo "${name}=${RESULTS[$name]}"
  done
  echo "failed=$FAILED"
} > "$RUN_DIR/summary.txt"

# Keep only last 14 days of results
find "$RESULTS_DIR" -maxdepth 1 -type d -mtime +14 -exec rm -rf {} + 2>/dev/null || true

if [[ $FAILED -gt 0 ]]; then
  fail "$FAILED suite(s) failed"
  exit 1
else
  pass "All suites passed"
  exit 0
fi
