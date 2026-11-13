import { expect, type TestInfo } from '@playwright/test';

const MAX_ATTEMPTS = 3;

interface NavigationBudgetOptions {
  /** The click-to-commit time the destination has to meet. */
  budgetMs: number;
  /** Annotation text for one attempt's click-to-commit time. */
  label: (elapsedMs: number) => string;
  /**
   * One complete attempt: load the starting page fresh, wait until the router
   * has prepared the destination, click, and return click-to-commit in ms.
   */
  measure: () => Promise<number>;
  testInfo: TestInfo;
}

/**
 * A click-to-commit time is read inside the page, yet a loaded CI runner still
 * adds tens of milliseconds to any single sample: in the nightly of 2026-11-13
 * four of six runs failed on a different navigation test, each 8 to 43% over
 * its budget, with the same code passing the run between them (#10103).
 *
 * Each attempt reloads the starting page, so it starts with an empty router
 * cache and a destination that has to be prepared again; a repeat click on an
 * already-visited route would be a different, much faster measurement. The
 * first attempt under the budget passes, and the test fails only when every
 * attempt is over it. A slowdown the app really has is over budget on every
 * attempt.
 */
export async function expectCommitWithinBudget({
  budgetMs,
  label,
  measure,
  testInfo,
}: NavigationBudgetOptions): Promise<void> {
  const samples: number[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const elapsedMs = await measure();
    samples.push(elapsedMs);
    testInfo.annotations.push({
      description: `attempt ${attempt}: ${label(elapsedMs)}`,
      type: 'click-to-destination',
    });
    if (elapsedMs < budgetMs) {
      break;
    }
  }
  expect(
    Math.min(...samples),
    `click-to-commit over ${budgetMs}ms on every attempt: ${samples.join(', ')}ms`,
  ).toBeLessThan(budgetMs);
}
