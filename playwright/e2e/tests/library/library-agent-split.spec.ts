import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const base = '/test-org/brand-1/library';

interface MockAsset {
  readonly id: string;
  readonly label: string;
}

const assets: readonly MockAsset[] = [
  { id: 'split-asset-1', label: 'Aurora hero still' },
  { id: 'split-asset-2', label: 'Aurora teaser cut' },
];

/** Answers the unified `/ingredients` list read with the given assets. */
async function mockLibraryAssets(
  page: Page,
  getAssets: () => readonly MockAsset[],
): Promise<void> {
  const fulfill = async (route: Route): Promise<void> => {
    const { pathname } = new URL(route.request().url());
    if (
      route.request().method() !== 'GET' ||
      !/\/ingredients$/.test(pathname)
    ) {
      await route.fallback();
      return;
    }

    const current = getAssets();
    await route.fulfill({
      body: JSON.stringify({
        data: current.map(({ id, label }) => ({
          attributes: {
            category: 'IMAGE',
            cdnUrl: 'https://cdn.genfeed.ai/mock/ingredient.jpg',
            createdAt: new Date().toISOString(),
            metadata: { label },
            status: 'UPLOADED',
          },
          id,
          type: 'ingredients',
        })),
        meta: { page: 1, pageSize: 24, totalCount: current.length },
      }),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/v1/ingredients**', fulfill);
}

test.describe('Library on the agent + output layout', () => {
  test.setTimeout(120_000);

  test('puts the agent left and the asset browser right', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockLibraryAssets(page, () => assets);
    await page.goto(`${base}/assets`);
    await assertNoErrorBoundaryFallback(page);

    const layout = page.getByTestId('agent-output-layout');
    const agent = layout.getByTestId('agent-output-agent-pane');
    const output = layout.getByTestId('agent-output-output-pane');
    await expect(agent).toBeVisible();
    await expect(output).toBeVisible();

    const agentBox = await agent.boundingBox();
    const outputBox = await output.boundingBox();
    expect(agentBox).not.toBeNull();
    expect(outputBox).not.toBeNull();
    expect(agentBox?.x ?? 0).toBeLessThan(outputBox?.x ?? 0);
    // 50/50 split, not an agent rail.
    expect(
      Math.abs((agentBox?.width ?? 0) - (outputBox?.width ?? 0)),
    ).toBeLessThan(24);

    // The conversation composer is in the left column, not a floating dock.
    await expect(
      agent.getByRole('textbox', { name: 'Conversation prompt' }),
    ).toBeVisible();

    // The assets render inside the output pane, and the folder tree stays in
    // the shell nav rather than taking a column of the pane.
    await expect(
      output.getByRole('button', { name: 'Select asset' }),
    ).toHaveCount(2);
    await expect(output.getByText('Folders', { exact: true })).toHaveCount(0);
  });

  test('reloads the assets in the output pane when the library refreshes', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let current: readonly MockAsset[] = [assets[0]];
    await mockLibraryAssets(page, () => current);
    await page.goto(`${base}/assets`);
    await assertNoErrorBoundaryFallback(page);

    const output = page.getByTestId('agent-output-output-pane');
    const cards = output.getByRole('button', { name: 'Select asset' });
    await expect(cards).toHaveCount(1);

    current = assets;
    await page.evaluate(() => {
      window.dispatchEvent(new Event('library:assets-refresh'));
    });

    await expect(cards).toHaveCount(2);
  });

  test('opens a picked asset in the output pane', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockLibraryAssets(page, () => assets);
    await page.goto(`${base}/assets`);
    await assertNoErrorBoundaryFallback(page);

    const output = page.getByTestId('agent-output-output-pane');
    await output
      .getByRole('button', { name: 'Asset preview unavailable' })
      .first()
      .click();

    await expect(output.getByRole('tab', { name: 'Context' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // The page stays two columns: the agent is still on the left.
    await expect(page.getByTestId('agent-output-agent-pane')).toBeVisible();
  });

  test('switches between agent and output on a phone', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockLibraryAssets(page, () => assets);
    await page.goto(`${base}/images`);
    await assertNoErrorBoundaryFallback(page);

    const layout = page.getByTestId('agent-output-layout');
    // A browse-first page opens on its assets, with the agent a tap away.
    await expect(layout).toHaveAttribute('data-mobile-view', 'output');
    await layout.getByRole('tab', { name: 'Agent' }).first().click();
    await expect(layout).toHaveAttribute('data-mobile-view', 'agent');
    await layout.getByRole('tab', { name: 'Output' }).first().click();
    await expect(layout).toHaveAttribute('data-mobile-view', 'output');
  });
});
