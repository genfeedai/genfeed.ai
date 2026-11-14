import { createPublishingBatchRoute } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockScheduledReleaseBatch,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * A week scheduled over MCP is read in full on the web and approved once
 * (#10134). The chat card shows three posts; this page shows all of them, and
 * the approval carries the posts the reviewer removed.
 */
test.describe('Publishing — scheduled batch review', () => {
  test('shows every post and approves the ones that are kept', async ({
    authenticatedPage: page,
  }) => {
    const decisions: Record<string, unknown>[] = [];
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await mockScheduledReleaseBatch(page, {
      onDecision: (body) => decisions.push(body),
      postCount: 6,
    });

    const route = brandPath(createPublishingBatchRoute('batch-approval-1'));
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: 'Schedule 6 posts' }),
    ).toBeVisible();
    for (let n = 1; n <= 6; n++) {
      await expect(page.getByText(`Batch post number ${n}`)).toBeVisible();
    }
    await expect(
      page.getByText('6 of 6 will be scheduled', { exact: true }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: /^Remove the .* post$/ })
      .first()
      .click();
    await expect(
      page.getByText('5 of 6 will be scheduled', { exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Approve 5' }).click();
    await page.getByRole('button', { name: 'Schedule 5' }).click();

    await expect.poll(() => decisions.length).toBe(1);
    expect(decisions[0]).toMatchObject({
      decision: 'approve',
      excludedIndexes: [0],
      itemId: 'mcp_approval:batch-approval-1',
    });
    await assertNoErrorBoundaryFallback(page, route);
  });
});
