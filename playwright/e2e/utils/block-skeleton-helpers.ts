import { expect, type Locator, type Page } from '@playwright/test';

/** Most a block may move or resize between its skeleton and its data. */
export const BLOCK_SHIFT_BUDGET_PX = 4;

export interface HeldRequests {
  /** Lets every held request through to the mocked API. */
  release: () => void;
  /** Resolves once at least one matching request is being held. */
  whenHeld: Promise<void>;
}

/**
 * Holds every request that matches until `release()`, then passes it on to
 * the mocked API (`route.fallback()` hands it to the earlier-registered
 * handlers). Register it before navigating. One held request keeps one block
 * in its loading state while the others fill from their own requests.
 */
export async function holdRequests(
  page: Page,
  matches: (url: URL) => boolean,
): Promise<HeldRequests> {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markHeld: () => void = () => {};
  const whenHeld = new Promise<void>((resolve) => {
    markHeld = resolve;
  });

  await page.route(
    (url) => matches(url),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      markHeld();
      await gate;
      await route.fallback();
    },
  );

  return { release, whenHeld };
}

/** The box a block fills, read while it loads and again once it has filled. */
export async function measureBlock(
  block: Locator,
): Promise<{ height: number; top: number }> {
  const box = await block.boundingBox();
  if (!box) {
    throw new Error('Block has no layout box');
  }
  return { height: box.height, top: box.y + (await scrollY(block.page())) };
}

async function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

export async function expectBlockWithinShiftBudget(
  loading: { height: number; top: number },
  filled: { height: number; top: number },
): Promise<void> {
  expect(Math.abs(filled.height - loading.height)).toBeLessThanOrEqual(
    BLOCK_SHIFT_BUDGET_PX,
  );
  expect(Math.abs(filled.top - loading.top)).toBeLessThanOrEqual(
    BLOCK_SHIFT_BUDGET_PX,
  );
}

/** Metric tiles keep their label and show a skeleton only in place of the value. */
export async function expectTileLabelsVisible(
  page: Page,
  labels: readonly string[],
): Promise<void> {
  for (const label of labels) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
}
