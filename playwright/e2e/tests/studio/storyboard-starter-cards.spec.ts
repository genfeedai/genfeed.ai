import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const base = '/test-org/brand-1/storyboard';
const time = '2026-11-01T00:00:00.000Z';

/** A freshly saved storyboard: the brief is in, nothing has been drafted yet. */
function buildEmptyRun(id: string, kind: 'video' | 'slideshow'): StoryboardRun {
  const isSlideshow = kind === 'slideshow';
  return {
    id,
    brandId: 'brand-1',
    organizationId: 'mock-org-id-e2e-test',
    createdAt: time,
    updatedAt: time,
    config: {
      origin: 'native',
      contract: 'storyboard-run',
      version: 1,
      revision: 1,
      clientRequestId: '6b1f6c2e-1c0e-4a7e-9f43-0c1d2e3f4a5b',
      createdByUserId: 'mock-user-id-e2e-test',
      submittedInputHash: 'a'.repeat(64),
      state: 'planning',
      sourceSnapshot: {
        selector: isSlideshow
          ? { kind: 'brief', brief: 'Calm founder habits', length: 'slideshow' }
          : { kind: 'brief', brief: 'Aurora speaker launch' },
        capturedAt: time,
      },
      plan: {
        ...(isSlideshow ? { kind: 'slideshow' as const } : {}),
        title: '',
        logline: '',
        format: isSlideshow ? '4:5' : '9:16',
        videoModelKey: null,
        runtimeBudgetSeconds: isSlideshow ? null : 15,
        styleReferenceAssetIds: [],
        cast: [],
        shots: [],
      },
    },
  } as StoryboardRun;
}

/** Serves the run read-only: picking a starter card must never write. */
async function routeEmptyRun(
  page: Page,
  run: StoryboardRun,
  draftUrls: string[] = [],
) {
  await page.route(
    `**/brands/brand-1/storyboard-runs/${run.id}**`,
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/capabilities')) {
        await route.fulfill({
          json: {
            version: 1,
            runId: run.id,
            runRevision: run.config.revision,
            capabilityVersion: 'b'.repeat(64),
            status: 'unavailable',
            requestedModelKey: null,
            effectiveModel: null,
            eligibleModels: [],
            reasonCode: 'MODEL_UNAVAILABLE',
          },
        });
        return;
      }
      if (path.endsWith('/plan/draft')) {
        draftUrls.push(path);
      }
      const { id, ...attributes } = run;
      await route.fulfill({
        json: { data: { id, type: 'content-run', attributes } },
      });
    },
  );
}

test.describe('Storyboard starter cards', () => {
  test.setTimeout(120_000);

  test('offers three video ideas that fill the composer without sending', async ({
    authenticatedPage: page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ height: 900, width: 1440 });
    const run = buildEmptyRun('starter-video', 'video');
    const draftUrls: string[] = [];
    await routeEmptyRun(page, run, draftUrls);

    await page.goto(`${base}/${run.id}`);
    await assertNoErrorBoundaryFallback(page);

    const agent = page.getByTestId('agent-output-agent-pane');
    const cards = agent.getByTestId('storyboard-starter-cards');
    await expect(cards).toBeVisible();
    await expect(cards.getByRole('button')).toHaveCount(3);

    await cards.getByRole('button', { name: 'Product teaser' }).click();
    await expect(agent.getByRole('textbox')).toContainText(
      'A 20-second teaser for a product launch',
    );
    // Picking an idea only fills the draft; the person still sends it.
    await expect(cards).toBeVisible();
    expect(draftUrls).toEqual([]);

    await cards.getByRole('button', { name: 'Founder story' }).click();
    await expect(agent.getByRole('textbox')).toContainText(
      'A 30-second founder story',
    );
    expect(draftUrls).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('offers slideshow ideas for a slideshow storyboard', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    const run = buildEmptyRun('starter-slideshow', 'slideshow');
    await routeEmptyRun(page, run);

    await page.goto(`${base}/${run.id}`);
    await assertNoErrorBoundaryFallback(page);

    const cards = page.getByTestId('storyboard-starter-cards');
    await expect(cards.getByRole('button')).toHaveCount(3);
    await expect(
      cards.getByRole('button', { name: 'Product teaser' }),
    ).toHaveCount(0);
    await cards.getByRole('button', { name: /./ }).first().click();
    await expect(
      page.getByTestId('agent-output-agent-pane').getByRole('textbox'),
    ).toContainText('slide');
  });
});
