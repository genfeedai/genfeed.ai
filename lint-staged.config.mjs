export default {
  '*.{js,ts,jsx,tsx,json,css,yml,yaml,md,toml,env*}': ['secretlint --no-glob'],
  '*.{js,ts,jsx,tsx,json,css}': (files) =>
    `biome check --write --config-path=biome-staged.json --no-errors-on-unmatched ${files.join(' ')}`,
  '*.tsx': ['bash scripts/lint-no-raw-html.sh'],
};
