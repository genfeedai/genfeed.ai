import type { Page } from '@playwright/test';
import { mockAnalyticsData } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  BLOCK_SHIFT_BUDGET_PX,
  holdRequests,
} from '../../utils/block-skeleton-helpers';

const ROUTE = '/test-org/brand-1/workspace/overview';

interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

async function boxOf(page: Page, testId: string): Promise<Box> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) {
    throw new Error(`${testId} has no layout box`);
  }
  return box;
}

function expectSamePlace(before: Box, after: Box): void {
  for (const edge of ['x', 'y', 'width', 'height'] as const) {
    expect(
      Math.abs(before[edge] - after[edge]),
      `${edge} moved`,
    ).toBeLessThanOrEqual(BLOCK_SHIFT_BUDGET_PX);
  }
}

/**
 * A hard load showed three placeholder layouts, none shaped like the next (epic
 * #10926, #10930). The frame placeholder now has the geometry of the real
 * shell, the page area stays empty until the page draws its own blocks, and no
 * block is drawn for the first 350 ms of a wait. #10058 (home sections) and
 * #7377 (empty-param shells) are unchanged.
 */
test.describe('Workspace overview — one placeholder layout', () => {
  test.setTimeout(90_000);

  test('the frame placeholder lands where the real rail, top bar and panel are', async ({
    authenticatedPage: page,
  }) => {
    await mockAnalyticsData(page);
    // Records whether the placeholder frame and the real shell are ever on
    // screen together: two different layouts at once.
    await page.addInitScript(() => {
      const seen = { both: false };
      (window as unknown as { __layouts: typeof seen }).__layouts = seen;
      new MutationObserver(() => {
        if (
          document.querySelector('[data-testid="workspace-frame-skeleton"]') &&
          document.querySelector('[data-testid="app-content-shell"]')
        ) {
          seen.both = true;
        }
      }).observe(document, { childList: true, subtree: true });
    });
    const held = await holdRequests(page, (url) =>
      url.pathname.includes('/v1/'),
    );

    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await held.whenHeld;
    await expect(page.getByTestId('workspace-frame-skeleton')).toBeVisible();
    const placeholder = {
      mark: await boxOf(page, 'workspace-frame-skeleton-mark'),
      panel: await boxOf(page, 'workspace-frame-skeleton-panel'),
      rail: await boxOf(page, 'workspace-frame-skeleton-rail'),
    };

    held.release();
    await expect(page.getByTestId('app-content-shell')).toBeVisible();
    await expect(page.getByTestId('workspace-frame-skeleton')).toHaveCount(0);

    expectSamePlace(placeholder.mark, await boxOf(page, 'app-rail-mark'));
    expectSamePlace(placeholder.rail, await boxOf(page, 'desktop-app-rail'));
    expectSamePlace(placeholder.panel, await boxOf(page, 'app-content-panel'));
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __layouts: { both: boolean } }).__layouts
            .both,
      ),
    ).toBe(false);
  });

  test('a placeholder block stays transparent for 350 ms, then fades in', async ({
    authenticatedPage: page,
  }) => {
    await mockAnalyticsData(page);
    const held = await holdRequests(page, (url) =>
      url.pathname.includes('/v1/'),
    );

    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await held.whenHeld;
    const block = page.locator('[data-slot="skeleton"]').first();
    await expect(block).toBeAttached();

    const timing = await block.evaluate((element) => {
      const animation = element
        .getAnimations()
        .find(
          (item) =>
            'animationName' in item && item.animationName === 'skeleton-appear',
        );
      if (!animation) {
        return null;
      }
      const { delay, fill } = animation.effect?.getTiming() ?? {};
      animation.pause();
      animation.currentTime = 100;
      const duringWait = getComputedStyle(element).opacity;
      animation.currentTime = 600;
      const afterWait = getComputedStyle(element).opacity;
      return { afterWait, delay, duringWait, fill };
    });

    expect(timing).toEqual({
      afterWait: '1',
      delay: 350,
      duringWait: '0',
      fill: 'both',
    });
    held.release();
  });

  test('the rail, top bar and sidebar shift by less than 0.01 during the load', async ({
    authenticatedPage: page,
  }) => {
    await mockAnalyticsData(page);
    // The page body is out of scope here: it draws its own blocks, and the
    // Home connection line grows in on purpose (#10058). A shift counts when it
    // moved something of the navigation frame.
    await page.addInitScript(() => {
      const state = { value: 0 };
      (window as unknown as { __cls: typeof state }).__cls = state;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            sources: { node: Node | null }[];
            value: number;
          };
          const movedNavigation = shift.sources.some(
            ({ node }) =>
              node !== null &&
              !node.parentElement?.closest('[data-testid="app-main-content"]'),
          );
          if (!shift.hadRecentInput && movedNavigation) {
            state.value += shift.value;
          }
        }
      }).observe({ buffered: true, type: 'layout-shift' });
    });

    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('app-content-shell')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const shift = await page.evaluate(
      () => (window as unknown as { __cls: { value: number } }).__cls.value,
    );
    expect(shift).toBeLessThan(0.01);
  });
});
