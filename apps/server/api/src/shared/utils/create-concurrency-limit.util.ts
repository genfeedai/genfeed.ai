import * as pLimitModule from 'p-limit';

type PLimitFactory = typeof import('p-limit').default;

const pLimit = ((pLimitModule as unknown as { default?: PLimitFactory })
  .default ?? (pLimitModule as unknown as PLimitFactory)) as PLimitFactory;

/**
 * Creates a concurrency limiter across ESM and bundled CommonJS runtimes.
 */
export const createConcurrencyLimit = (concurrency: number) =>
  pLimit(concurrency);
