import baseConfig from './vitest.config';

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    coverage: { enabled: false },
    include: ['test/e2e/**/*.e2e.spec.ts'],
  },
};
