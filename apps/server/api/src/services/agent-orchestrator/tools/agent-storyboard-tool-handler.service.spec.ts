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

const slideshowPlan: StoryboardPlan = {
  kind: 'slideshow',
  videoModelKey: null,
  title: 'Five habits',
  logline: 'Swipe for five habits.',
  format: '4:5',
  runtimeBudgetSeconds: null,
  styleReferenceAssetIds: [],
  cast: [],
  shots: ['a', 'b', 'c'].map((id, index) => ({
    id: `slide-${id}`,
    ordinal: index + 1,
    action: `Habit ${id}`,
    onScreenSpeaker: false,
    durationSeconds: null,
    stillFreshness: 'missing' as const,
    transition: 'cut' as const,
  })),
};

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
  const stills = {
    generate: vi.fn(
      async (_org: string, _brand: string, _run: string, _user: string) =>
        storyboardRun(5, slideshowPlan),
    ),
    quote: vi.fn(async () => ({ credits: 9, inputHash: 'a'.repeat(64) })),
  };
  const slideshowPosts = {
    createDraft: vi.fn(async () => ({ postId: 'post-1' })),
  };
  const slideshowRuns = {
    ...runs,
    get: vi.fn(async () => storyboardRun(3, slideshowPlan)),
  };
  const handler = new AgentStoryboardToolHandler(
    runs as never,
    stills as never,
    aRoll as never,
    {} as never,
    {} as never,
    {} as never,
    moduleAccess as never,
    slideshowPosts as never,
  );
  const slideshowHandler = new AgentStoryboardToolHandler(
    slideshowRuns as never,
    stills as never,
    aRoll as never,
    {} as never,
    {} as never,
    {} as never,
    moduleAccess as never,
    slideshowPosts as never,
  );
  return { handler, runs, slideshowHandler, stills };
}

describe('AgentStoryboardToolHandler', () => {
  it('routes only the long-form storyboard tools', () => {
    expect(isAgentStoryboardTool('storyboard_long_form')).toBe(true);
    expect(isAgentStoryboardTool('start_storyboard_long_form')).toBe(true);
    expect(isAgentStoryboardTool('storyboard_slideshow')).toBe(true);
    expect(isAgentStoryboardTool('start_storyboard_slideshow')).toBe(true);
    expect(isAgentStoryboardTool('generate')).toBe(false);
  });

  it('reads a slideshow as slides chat can reorder by id', async () => {
    const { slideshowHandler } = setup();

    const result = await slideshowHandler.execute(
      'storyboard_slideshow',
      { action: 'get', brandId: 'brand-1', runId: 'run-1' },
      ctx,
    );

    expect(result.data).toMatchObject({
      title: 'Five habits',
      longForm: null,
      slideshow: {
        caption: 'Swipe for five habits.',
        format: '4:5',
        slides: [
          { id: 'slide-a', description: 'Habit a', imageState: 'missing' },
          { id: 'slide-b', description: 'Habit b', imageState: 'missing' },
          { id: 'slide-c', description: 'Habit c', imageState: 'missing' },
        ],
      },
    });
  });

  it('saves a new swipe order and drops the slides left out', async () => {
    const { slideshowHandler } = setup();

    const result = await slideshowHandler.execute(
      'storyboard_slideshow',
      {
        action: 'edit_slides',
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 3,
        order: ['slide-c', 'slide-a'],
        slides: [{ id: 'slide-a', description: 'A sharper habit' }],
      },
      ctx,
    );

    expect(
      (result.data as { slideshow: { slides: unknown[] } }).slideshow.slides,
    ).toMatchObject([
      { id: 'slide-c', description: 'Habit c' },
      { id: 'slide-a', description: 'A sharper habit' },
    ]);
  });

  it('refuses an edit that names a slide the run does not have', async () => {
    const { slideshowHandler } = setup();

    const result = await slideshowHandler.execute(
      'storyboard_slideshow',
      {
        action: 'edit_slides',
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 3,
        order: ['slide-z', 'slide-a'],
      },
      ctx,
    );

    expect(result).toMatchObject({
      success: false,
      error: 'Unknown slide ids: slide-z',
    });
  });

  it('quotes slides, starts the quoted images and saves only a draft post', async () => {
    const { slideshowHandler } = setup();

    const quote = await slideshowHandler.execute(
      'storyboard_slideshow',
      {
        action: 'quote',
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 3,
        slideIds: ['slide-a'],
      },
      ctx,
    );
    const started = await slideshowHandler.execute(
      'start_storyboard_slideshow',
      {
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 5,
        inputHash: 'a'.repeat(64),
      },
      ctx,
    );
    const post = await slideshowHandler.execute(
      'storyboard_slideshow',
      {
        action: 'save_draft_post',
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 5,
      },
      ctx,
    );

    expect(quote.data).toEqual({ credits: 9, inputHash: 'a'.repeat(64) });
    expect(started).toMatchObject({ data: { revision: 5 } });
    expect(post.data).toEqual({ executionState: 'draft', postId: 'post-1' });
  });

  it('rejects a slideshow start without a quote hash', async () => {
    const result = await setup().slideshowHandler.execute(
      'start_storyboard_slideshow',
      {
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 5,
        inputHash: 'short',
      },
      ctx,
    );

    expect(result).toMatchObject({ success: false, creditsUsed: 0 });
    expect(result.error).toContain('Invalid storyboard input');
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
        slideshow: null,
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
