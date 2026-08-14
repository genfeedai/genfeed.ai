#!/usr/bin/env bash
# Weekly Coverage jobs historically required lcov.info, but Vitest merge-reports
# and some package reporters emit coverage-final.json / clover.xml without LCOV.
# Accept either so a complete Istanbul report is not treated as a missing gate.
set -euo pipefail

coverage_dir="${1:?coverage directory required}"
lcov_report="${coverage_dir}/lcov.info"
istanbul_report="${coverage_dir}/coverage-final.json"

if [ -s "${lcov_report}" ]; then
  echo "Found coverage report: ${lcov_report} ($(wc -c < "${lcov_report}") bytes)"
  exit 0
fi

if [ -s "${istanbul_report}" ]; then
  echo "Found coverage report: ${istanbul_report} ($(wc -c < "${istanbul_report}") bytes); lcov.info was not emitted"
  exit 0
fi

echo "::error::${coverage_dir} tests passed but no non-empty lcov.info or coverage-final.json was generated"
exit 1
