#!/usr/bin/env bash
# Measurement for .github/workflows/playwright-route-cache-bench.yml.
# Usage: playwright-route-cache-bench.sh subset|core
set -uo pipefail

mode="${1:?usage: $0 subset|core}"
out="bench-results"
mkdir -p "$out"

SUBSET_SPECS=(
  playwright/e2e/tests/auth/login.spec.ts
  playwright/e2e/tests/studio/turbo.spec.ts
  playwright/e2e/tests/posts/posts-interactions.spec.ts
  playwright/e2e/tests/states/error-states.spec.ts
  playwright/e2e/tests/dashboard/navigation.spec.ts
  playwright/e2e/tests/dashboard/analytics.spec.ts
  playwright/e2e/tests/workflows/workflows-templates-executions.spec.ts
  playwright/e2e/tests/workflows/workflows-builder-interactions.spec.ts
  playwright/e2e/tests/smoke/all-app-pages.spec.ts
)

bundle="$(grep -rl 'Network.setCacheDisabled", { cacheDisabled: enabled }' node_modules/playwright-core/lib | head -n1)"
if [ -z "$bundle" ]; then
  echo "playwright-core cache-disable call not found; cannot patch" >&2
  exit 1
fi
cp "$bundle" "$out/playwright-core-bundle.orig"
echo "patch target: $bundle"

set_cache_patch() {
  if [ "$1" = "on" ]; then
    sed -i 's/Network.setCacheDisabled", { cacheDisabled: enabled }/Network.setCacheDisabled", { cacheDisabled: false }/' "$bundle"
  else
    cp "$out/playwright-core-bundle.orig" "$bundle"
  fi
}

run_once() {
  local label="$1"
  shift
  rm -rf playwright/artifacts/report
  local start end
  start=$(date +%s)
  "$@"
  local status=$?
  end=$(date +%s)
  cp playwright/artifacts/report/results.json "$out/$label.json" 2>/dev/null || echo "{}" > "$out/$label.json"
  echo "$label,$((end - start)),$status" >> "$out/wall.csv"
  echo "== $label: $((end - start))s wall, exit $status"
}

# A = stock Playwright (cache disabled whenever a route exists)
# B = cache-disable call patched out (HTTP cache stays on, routes still work)
if [ "$mode" = "subset" ]; then
  runner=(bunx playwright test --config=playwright/configs/playwright.config.ts --project=app-core "${SUBSET_SPECS[@]}")
  for round in 1 2; do
    set_cache_patch off; run_once "A-$round" "${runner[@]}"
    set_cache_patch on;  run_once "B-$round" "${runner[@]}"
  done
else
  set_cache_patch off; run_once "A-1" bun run test:e2e:sharded
  set_cache_patch on;  run_once "B-1" bun run test:e2e:sharded
fi
set_cache_patch off

node - "$out" <<'NODE'
const fs = require('node:fs');
const out = process.argv[2];
const rows = [];
const wall = Object.fromEntries(
  fs.readFileSync(`${out}/wall.csv`, 'utf8').trim().split('\n').map((l) => {
    const [label, secs, status] = l.split(',');
    return [label, { secs: Number(secs), status }];
  }),
);
const walk = (suite, fn) => { (suite.specs ?? []).forEach(fn); (suite.suites ?? []).forEach((s) => walk(s, fn)); };
for (const label of Object.keys(wall)) {
  const report = JSON.parse(fs.readFileSync(`${out}/${label}.json`, 'utf8'));
  let tests = 0, passed = 0, testMs = 0;
  (report.suites ?? []).forEach((s) => walk(s, (spec) => spec.tests.forEach((t) => {
    const last = t.results.at(-1);
    tests += 1;
    if (last?.status === 'passed') { passed += 1; testMs += last.duration; }
  })));
  rows.push({ label, wallS: wall[label].secs, tests, passed, passedTestS: Math.round(testMs / 1000) });
}
const lines = ['| run | wall s | tests | passed | sum of passed test durations s |', '|---|---|---|---|---|'];
rows.forEach((r) => lines.push(`| ${r.label} | ${r.wallS} | ${r.tests} | ${r.passed} | ${r.passedTestS} |`));
const summary = lines.join('\n');
console.log(summary);
fs.writeFileSync(`${out}/summary.md`, summary + '\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
NODE
exit 0
