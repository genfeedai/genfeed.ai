import webConfig from './vitest.config.mts';

// Source contracts read files as text and assert on the text. Creating jsdom
// and running the DOM setup (testing-library cleanup, a Radix Tooltip preload)
// for each of the 200+ files cost about 160 s of a 220 s CI step (#10271).
// The few that render components are listed in DOM_SOURCE_CONTRACT_FILES in
// scripts/ci/source-contracts.mjs and run under vitest.config.mts instead.
export default {
  ...webConfig,
  test: {
    ...webConfig.test,
    environment: 'node',
    setupFiles: [],
  },
};
