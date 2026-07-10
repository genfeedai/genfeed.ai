export default {
  '*.{js,ts,jsx,tsx,json,css,yml,yaml,md,toml,env*}': [
    'bun scripts/run-secretlint.ts --no-glob',
  ],
  '*.{js,ts,jsx,tsx,json,css}': (files) =>
    `biome check --write --config-path=biome-staged.json --no-errors-on-unmatched ${files.join(' ')}`,
  // Same canonical raw-control scanner CI runs (scripts/ui/check-ui-guards.ts),
  // here in changed-files mode: staged paths are passed as args. `.ts` is
  // included so dead-wrapper imports in plain modules are caught too.
  '*.{ts,tsx,jsx}': (files) =>
    `bun scripts/ui/control-guard.ts ${files.join(' ')}`,
  '*.tsx': ['bash scripts/lint-no-bespoke-card.sh'],
};
