import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const base = '/test-org/brand-1/storyboard';
const time = '2026-10-29T00:00:00.000Z';
const originalAction = 'Close on the speaker glowing at dusk';
const changedAction = 'Cut to the speaker in two seconds, end on a question';

function buildRun(revision: number, thirdShotAction: string): StoryboardRun {
  return {
    id: 'split-run',
    brandId: 'brand-1',
    organizationId: 'mock-org-id-e2e-test',
    createdAt: time,
    updatedAt: time,
    config: {
      origin: 'native',
      contract: 'storyboard-run',
      version: 1,
      revision,
      clientRequestId: '6b1f6c2e-1c0e-4a7e-9f43-0c1d2e3f4a5b',
      createdByUserId: 'mock-user-id-e2e-test',
      submittedInputHash: 'a'.repeat(64),
      state: 'storyboard',
      sourceSnapshot: {
        selector: { kind: 'brief', brief: 'Aurora speaker launch teaser' },
        capturedAt: time,
      },
      plan: {
        title: 'Aurora speaker launch teaser',
        logline: 'A speaker that lights the room.',
        format: '9:16',
        videoModelKey: null,
        runtimeBudgetSeconds: 15,
        styleReferenceAssetIds: [],
        cast: [],
        shots: [
          ['Open on the empty shelf', 3],
          ['Show the speaker detail', 4],
          [thirdShotAction, 4],
        ].map(([action, durationSeconds], index) => ({
          id: `shot-${index + 1}`,
          ordinal: index + 1,
          action: String(action),
          durationSeconds: Number(durationSeconds),
          onScreenSpeaker: false,
          stillFreshness: 'missing' as const,
          transition: 'cut' as const,
        })),
      },
    },
  } as StoryboardRun;
}

interface SplitRunState {
  drafts: Array<{ expectedRevision: number; instruction?: string }>;
  run: StoryboardRun;
}

/** Serves the run, and applies one change request to shot 3 when asked to draft. */
async function routeSplitRun(page: Page, state: SplitRunState) {
  await page.route(
    '**/brands/brand-1/storyboard-runs/split-run**',
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/capabilities')) {
        await route.fulfill({
          json: {
            version: 1,
            runId: state.run.id,
            runRevision: state.run.config.revision,
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
        state.drafts.push(route.request().postDataJSON());
        state.run = buildRun(state.run.config.revision + 1, changedAction);
      } else if (route.request().method() !== 'GET') {
        throw new Error(`Unexpected mutation: ${path}`);
      }
      const { id, ...attributes } = state.run;
      await route.fulfill({
        json: { data: { id, type: 'content-run', attributes } },
      });
    },
  );
}

test.describe('Storyboard agent + output split', () => {
  test.setTimeout(120_000);

  test('changes a shot from the agent column and the board updates', async ({
    authenticatedPage: page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ height: 900, width: 1440 });
    const state: SplitRunState = {
      drafts: [],
      run: buildRun(1, originalAction),
    };
    await routeSplitRun(page, state);

    await page.goto(`${base}/split-run`);
    await assertNoErrorBoundaryFallback(page);

    const agent = page.getByTestId('agent-output-agent-pane');
    const output = page.getByTestId('agent-output-output-pane');
    const board = output.getByRole('tabpanel', { name: 'Shots' });
    await expect(agent).toBeVisible();
    await expect(output).toBeVisible();
    // Agent on the left, output on the right, each half the canvas.
    const [agentBox, outputBox] = await Promise.all([
      agent.boundingBox(),
      output.boundingBox(),
    ]);
    expect(agentBox?.x ?? 0).toBeLessThan(outputBox?.x ?? 0);
    expect(
      Math.abs((agentBox?.width ?? 0) - (outputBox?.width ?? 0)),
    ).toBeLessThanOrEqual(2);
    // One agent: no product dock toggle beside the page's own.
    await expect(page.getByTestId('topbar-agent-dock-toggle')).toHaveCount(0);
    await expect(page.getByTestId('agent-dock')).toHaveCount(0);

    await expect(
      board.getByLabel('Action', { exact: true }).nth(2),
    ).toHaveValue(originalAction);

    await agent
      .getByRole('textbox')
      .fill('Make shot 3 shorter and end on a question');
    await agent.getByRole('button', { name: /send/i }).click();

    await expect(agent.getByRole('log')).toContainText(
      'Make shot 3 shorter and end on a question',
    );
    await expect(agent.getByRole('log')).toContainText('Updated the board.');
    await expect(
      board.getByLabel('Action', { exact: true }).nth(2),
    ).toHaveValue(changedAction);
    expect(state.drafts).toEqual([
      {
        expectedRevision: 1,
        instruction: 'Make shot 3 shorter and end on a question',
      },
    ]);
    expect(pageErrors).toEqual([]);
  });

  test('docks the animatic in a third Preview pane on a wide screen', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1680 });
    await routeSplitRun(page, { drafts: [], run: buildRun(1, originalAction) });

    await page.goto(`${base}/split-run`);
    await assertNoErrorBoundaryFallback(page);

    const agent = page.getByTestId('agent-output-agent-pane');
    const output = page.getByTestId('agent-output-output-pane');
    const preview = page.getByTestId('agent-output-preview-pane');
    await expect(preview).toBeVisible();
    // Agent, then the board, then the preview, left to right.
    const [agentBox, outputBox, previewBox] = await Promise.all([
      agent.boundingBox(),
      output.boundingBox(),
      preview.boundingBox(),
    ]);
    expect(agentBox?.x ?? 0).toBeLessThan(outputBox?.x ?? 0);
    expect(outputBox?.x ?? 0).toBeLessThan(previewBox?.x ?? 0);

    await expect(
      preview.getByRole('region', { name: 'Storyboard animatic' }),
    ).toBeVisible();
    await expect(
      output.getByRole('region', { name: 'Storyboard animatic' }),
    ).toHaveCount(0);
    await expect(
      preview.getByText('The final video shows here once the shots render.'),
    ).toBeVisible();
  });

  test('keeps the animatic on the board when the preview pane does not fit', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await routeSplitRun(page, { drafts: [], run: buildRun(1, originalAction) });

    await page.goto(`${base}/split-run`);
    await assertNoErrorBoundaryFallback(page);

    await expect(page.getByTestId('agent-output-preview-pane')).toBeHidden();
    await expect(
      page
        .getByTestId('agent-output-output-pane')
        .getByRole('region', { name: 'Storyboard animatic' }),
    ).toBeVisible();
  });

  test('shows one pane at a time on a phone', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await routeSplitRun(page, { drafts: [], run: buildRun(1, originalAction) });

    await page.goto(`${base}/split-run`);
    await assertNoErrorBoundaryFallback(page);

    const agent = page.getByTestId('agent-output-agent-pane');
    const output = page.getByTestId('agent-output-output-pane');
    const board = output.getByRole('tabpanel', { name: 'Shots' });
    await expect(agent).toBeVisible();
    await expect(output).toBeHidden();

    await page
      .getByTestId('agent-output-layout')
      .getByRole('button', { name: 'View: Agent' })
      .click();
    await page.getByRole('menuitemradio', { name: 'Output' }).click();

    await expect(output).toBeVisible();
    await expect(agent).toBeHidden();
    await expect(
      board.getByLabel('Action', { exact: true }).nth(2),
    ).toHaveValue(originalAction);
  });
});
