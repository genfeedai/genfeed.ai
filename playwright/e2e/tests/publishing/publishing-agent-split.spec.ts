import type { Page } from '@playwright/test';
import {
  mockActiveSubscription,
  mockPostsList,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const base = '/test-org/brand-1/publishing';

/** Counts the GET list reads the page makes against one collection. */
function countListReads(page: Page, collection: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      new URL(request.url()).pathname.endsWith(`/${collection}`)
    ) {
      count += 1;
    }
  });
  return () => count;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
    /* a socket or poll can keep the network busy; the count is still stable */
  });
}

test.describe('Publishing on the agent + output layout', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  });

  test('puts the agent left and the post queue right', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/posts`);
    await assertNoErrorBoundaryFallback(page);

    const layout = page.getByTestId('agent-output-layout');
    const agent = layout.getByTestId('agent-output-agent-pane');
    const output = layout.getByTestId('agent-output-output-pane');
    await expect(layout).toHaveAttribute('data-mode', 'split');
    await expect(output.getByRole('tab', { name: 'Queue' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const agentBox = await agent.boundingBox();
    const outputBox = await output.boundingBox();
    expect(agentBox?.x ?? 0).toBeLessThan(outputBox?.x ?? 0);
    expect(
      Math.abs((agentBox?.width ?? 0) - (outputBox?.width ?? 0)),
    ).toBeLessThan(24);

    // The conversation is in the left column, the queue's own controls stay
    // in the output pane, and the page no longer carries a second Chat toggle.
    await expect(
      agent.getByRole('textbox', { name: 'Conversation prompt' }),
    ).toBeVisible();
    await expect(
      output.getByRole('button', { name: 'New post' }),
    ).toBeVisible();
    await expect(page.getByTestId('topbar-agent-dock-toggle')).toHaveCount(0);
  });

  test('keeps the calendar wide with the agent as a rail that expands', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/calendar`);
    await assertNoErrorBoundaryFallback(page);

    const layout = page.getByTestId('agent-output-layout');
    const agent = layout.getByTestId('agent-output-agent-pane');
    const output = layout.getByTestId('agent-output-output-pane');
    await expect(layout).toHaveAttribute('data-mode', 'rail');
    await expect(output.getByRole('tab', { name: 'Calendar' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const railWidth = (await agent.boundingBox())?.width ?? 0;
    const calendarWidth = (await output.boundingBox())?.width ?? 0;
    expect(railWidth).toBeLessThan(420);
    expect(calendarWidth).toBeGreaterThan(railWidth * 2);

    await layout.getByTestId('agent-output-rail-toggle').click();
    await expect(layout).toHaveAttribute('data-mode', 'split');
    const expandedAgent = (await agent.boundingBox())?.width ?? 0;
    const expandedOutput = (await output.boundingBox())?.width ?? 0;
    expect(Math.abs(expandedAgent - expandedOutput)).toBeLessThan(24);

    await layout.getByTestId('agent-output-rail-toggle').click();
    await expect(layout).toHaveAttribute('data-mode', 'rail');
  });

  test('puts the agent beside the overview and leaves approvals on the dock', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${base}/overview`);
    await assertNoErrorBoundaryFallback(page);
    await expect(
      page
        .getByTestId('agent-output-output-pane')
        .getByRole('tab', { name: 'Overview' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('agent-output-agent-pane')).toBeVisible();

    // The approvals inspector is the work surface, so it keeps the dock.
    await page.goto(`${base}/approvals`);
    await assertNoErrorBoundaryFallback(page);
    await expect(page.getByTestId('agent-output-layout')).toHaveCount(0);
    await expect(page.getByTestId('topbar-agent-dock-toggle')).toBeVisible();
  });

  test('reloads the queue when the agent changes posts', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockPostsList(page, []);
    const postReads = countListReads(page, 'posts');
    await page.goto(`${base}/posts`);
    await assertNoErrorBoundaryFallback(page);
    await expect.poll(postReads).toBeGreaterThan(0);
    await settle(page);

    const before = postReads();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('publishing:content-refresh'));
    });

    await expect.poll(postReads).toBeGreaterThan(before);
  });

  test('reloads the calendar when the agent changes posts', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const releaseReads = countListReads(page, 'post-groups');
    await page.goto(`${base}/calendar`);
    await assertNoErrorBoundaryFallback(page);
    await expect.poll(releaseReads).toBeGreaterThan(0);
    await settle(page);

    const before = releaseReads();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('publishing:content-refresh'));
    });

    await expect.poll(releaseReads).toBeGreaterThan(before);
  });

  test('opens on the queue on a phone, with the agent a tap away', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/posts`);
    await assertNoErrorBoundaryFallback(page);

    const layout = page.getByTestId('agent-output-layout');
    await expect(layout).toHaveAttribute('data-mobile-view', 'output');
    await layout.getByRole('tab', { name: 'Agent' }).first().click();
    await expect(layout).toHaveAttribute('data-mobile-view', 'agent');
  });
});
