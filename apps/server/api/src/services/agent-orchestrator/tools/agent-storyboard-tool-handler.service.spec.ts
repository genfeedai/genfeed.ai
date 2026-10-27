import {
  AgentStoryboardToolHandler,
  isAgentStoryboardTool,
} from '@api/services/agent-orchestrator/tools/agent-storyboard-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const plan: StoryboardPlan = {
  videoModelKey: null,
  title: 'Why creators quit',
  logline: 'A short talk on consistency.',
  format: '16:9',
  runtimeBudgetSeconds: null,
  styleReferenceAssetIds: [],
  cast: [{ id: 'presenter', name: 'Presenter', referenceAssetIds: [] }],
  shots: [],
  longForm: {
    runtimeBudgetSeconds: 20,
    presenterId: 'presenter',
    segments: [
      {
        id: 'segment-hook',
        ordinal: 1,
        sectionLabel: 'Hook',
        narration: 'Most creators quit in the first ninety days.',
        estimatedSeconds: 4,
        cutaways: [
          {
            id: 'cutaway-calendar',
            kind: 'still',
            brief: 'A wall calendar',
            assetId: 'calendar-still',
            startSeconds: 1,
            durationSeconds: 2,
          },
        ],
      },
    ],
  },
};

function storyboardRun(revision: number, nextPlan = plan): StoryboardRun {
  return {
    id: 'run-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    config: {
      revision,
      approvedRevision: revision,
      state: 'approved',
      plan: nextPlan,
    },
  } as unknown as StoryboardRun;
}

const ctx = {
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

function setup(isAllowed = true) {
  const runs = {
    get: vi.fn(async () => storyboardRun(3)),
    updatePlan: vi.fn(
      async (_org: string, _brand: string, _run: string, body: unknown) =>
        storyboardRun(4, (body as { plan: StoryboardPlan }).plan),
    ),
  };
  const aRoll = {
    quote: vi.fn(async (track: string) => ({ track, credits: 12 })),
  };
  const moduleAccess = {
    assertAccess: vi.fn(async () => {
      if (!isAllowed) throw new ForbiddenException('Storyboard is not on.');
    }),
  };
  const handler = new AgentStoryboardToolHandler(
    runs as never,
    {} as never,
    aRoll as never,
    {} as never,
    {} as never,
    {} as never,
    moduleAccess as never,
  );
  return { handler, runs };
}

describe('AgentStoryboardToolHandler', () => {
  it('routes only the long-form storyboard tools', () => {
    expect(isAgentStoryboardTool('storyboard_long_form')).toBe(true);
    expect(isAgentStoryboardTool('start_storyboard_long_form')).toBe(true);
    expect(isAgentStoryboardTool('generate')).toBe(false);
  });

  it('reads the run as a script chat can edit by id', async () => {
    const { handler } = setup();

    const result = await handler.execute(
      'storyboard_long_form',
      { action: 'get', brandId: 'brand-1', runId: 'run-1' },
      ctx,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      success: true,
      data: {
        runId: 'run-1',
        brandId: 'brand-1',
        revision: 3,
        state: 'approved',
        isPlanApproved: true,
        title: 'Why creators quit',
        animatic: null,
        presenter: null,
        longForm: {
          presenterId: 'presenter',
          runtimeBudgetSeconds: 20,
          segments: [
            {
              id: 'segment-hook',
              sectionLabel: 'Hook',
              narration: 'Most creators quit in the first ninety days.',
              estimatedSeconds: 4,
              cutaways: [
                {
                  id: 'cutaway-calendar',
                  brief: 'A wall calendar',
                  hasFootage: true,
                },
              ],
            },
          ],
        },
      },
    });
  });

  it('saves script edits and drops the footage of a rewritten cutaway', async () => {
    const { handler } = setup();

    const result = await handler.execute(
      'storyboard_long_form',
      {
        action: 'edit_script',
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 3,
        segments: [{ id: 'segment-hook', narration: 'Most quit early.' }],
        cutaways: [{ id: 'cutaway-calendar', brief: 'An empty desk' }],
      },
      ctx,
    );

    const segment = (
      result.data as {
        longForm: { segments: Record<string, unknown>[] };
      }
    ).longForm.segments[0];
    expect(result.success).toBe(true);
    expect(segment).toMatchObject({
      narration: 'Most quit early.',
      cutaways: [
        { id: 'cutaway-calendar', brief: 'An empty desk', hasFootage: false },
      ],
    });
  });

  it('quotes the presenter stage on the HeyGen track', async () => {
    const { handler } = setup();

    const result = await handler.execute(
      'storyboard_long_form',
      {
        action: 'quote',
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 3,
        stage: 'presenter',
      },
      ctx,
    );

    expect(result.data).toEqual({ track: 'aRoll', credits: 12 });
  });

  it('returns a readable failure for bad input or a closed module', async () => {
    const invalid = await setup().handler.execute(
      'start_storyboard_long_form',
      {
        brandId: 'brand-1',
        runId: 'run-1',
        stage: 'presenter',
        expectedRevision: 3,
        inputHash: 'not-a-hash',
      },
      ctx,
    );
    expect(invalid).toMatchObject({ success: false, creditsUsed: 0 });
    expect(invalid.error).toContain('Invalid storyboard input');

    const closed = await setup(false).handler.execute(
      'storyboard_long_form',
      {
        action: 'approve_plan',
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 3,
      },
      ctx,
    );
    expect(closed).toMatchObject({
      success: false,
      error: 'Storyboard is not on.',
    });
  });
});
