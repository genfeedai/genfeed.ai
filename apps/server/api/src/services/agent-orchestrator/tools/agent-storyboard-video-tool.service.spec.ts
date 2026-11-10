import {
  AgentStoryboardToolHandler,
  isAgentStoryboardTool,
} from '@api/services/agent-orchestrator/tools/agent-storyboard-tool-handler.service';
import { AgentStoryboardVideoTool } from '@api/services/agent-orchestrator/tools/agent-storyboard-video-tool.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const HASH = 'a'.repeat(64);
const ctx = {
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

const basePlan: StoryboardPlan = {
  videoModelKey: null,
  title: 'Late',
  logline: '',
  format: '9:16',
  runtimeBudgetSeconds: 12,
  styleReferenceAssetIds: [],
  cast: [{ id: 'mia', name: 'Mia', referenceAssetIds: [] }],
  assetBible: [
    {
      id: 'mia-face',
      kind: 'character_face',
      label: 'Mia face',
      castMemberId: 'mia',
      sourceAssetIds: ['photo-1'],
      variantAssetIds: ['face-1'],
      chosenAssetId: 'face-1',
    },
  ],
  shots: [
    {
      id: 'shot-1',
      ordinal: 1,
      action: 'Mia checks the clock.',
      onScreenSpeaker: false,
      durationSeconds: 6,
      stillFreshness: 'missing',
      transition: 'cut',
      videoPrompt: 'Close on Mia.',
    },
  ],
};

/** A run store the fakes share, so each step sees the last one's writes. */
function setup() {
  let current: StoryboardRun = {
    id: 'run-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    createdAt: '2026-11-07T12:00:00.000Z',
    updatedAt: '2026-11-07T12:00:00.000Z',
    config: {
      revision: 3,
      approvedRevision: 3,
      state: 'approved',
      plan: basePlan,
    },
  } as unknown as StoryboardRun;
  const runs = {
    get: async () => current,
    updatePlan: async (
      _org: string,
      _brand: string,
      _run: string,
      body: { expectedRevision: number; plan: StoryboardPlan },
    ) => {
      current = {
        ...current,
        config: {
          ...current.config,
          revision: body.expectedRevision + 1,
          plan: body.plan,
        },
      } as StoryboardRun;
      return current;
    },
  };
  const quote =
    (kind: string) =>
    async (_o: string, _b: string, _r: string, body: unknown) => ({
      kind,
      body,
      inputHash: HASH,
      total: 10,
    });
  const renders = {
    quote: async (_o: string, _b: string, _r: string, body: unknown) => {
      if ((body as { stage: string }).stage === 'draft')
        throw new BadRequestException(
          'Every shot already has a current draft.',
        );
      return { kind: 'renders', body, inputHash: HASH, total: 40 };
    },
    start: async () => current,
    reconcile: async () => current,
  };
  const assets = {
    quote: quote('assets'),
    start: async (
      _o: string,
      _b: string,
      _r: string,
      _u: string,
      body: unknown,
    ) => {
      started.push(body);
      return current;
    },
    reconcile: async () => current,
  };
  const stills = {
    quote: quote('stills'),
    generate: async () => current,
    reconcile: async () => current,
  };
  const started: unknown[] = [];
  const video = new AgentStoryboardVideoTool(
    runs as never,
    stills as never,
    renders as never,
    assets as never,
    { check: async () => current } as never,
    {
      assemble: async () => ({
        editorProjectId: 'project-1',
        shotIds: ['shot-1'],
      }),
    } as never,
  );
  const handler = new AgentStoryboardToolHandler(
    runs as never,
    stills as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: vi.fn(async () => undefined) } as never,
    {} as never,
    video,
  );
  const call = (name: string, params: Record<string, unknown>) =>
    handler.execute(
      name,
      { brandId: 'brand-1', runId: 'run-1', ...params },
      ctx,
    );
  return { call, started };
}

describe('storyboard_video tools', () => {
  it.each(['storyboard_video', 'start_storyboard_video'])(
    'routes %s to the storyboard handler',
    (name) => {
      expect(isAgentStoryboardTool(name)).toBe(true);
    },
  );

  it('edits shots by id and can return a shot to its compiled prompt', async () => {
    const { call } = setup();
    const result = await call('storyboard_video', {
      action: 'edit_shots',
      expectedRevision: 3,
      shots: [
        {
          id: 'shot-1',
          sfx: ['a clock ticks'],
          cuts: [{ startSeconds: 0, endSeconds: 2, framing: 'close-up' }],
          videoPrompt: '',
        },
      ],
    });
    expect(result.data).toMatchObject({
      revision: 4,
      shots: [
        {
          id: 'shot-1',
          action: 'Mia checks the clock.',
          sfx: ['a clock ticks'],
          cuts: [{ startSeconds: 0, endSeconds: 2, framing: 'close-up' }],
          hasCustomPrompt: false,
        },
      ],
    });
  });

  it('changes an asset bible entry without losing its generated variants', async () => {
    const { call } = setup();
    const result = await call('storyboard_video', {
      action: 'assets',
      expectedRevision: 3,
      entries: [
        {
          id: 'mia-face',
          kind: 'character_face',
          label: 'Mia',
          chosenAssetId: 'photo-1',
        },
        {
          id: 'clock',
          kind: 'prop',
          label: 'Wall clock',
          brief: 'A brass wall clock',
        },
      ],
    });
    expect(result.data).toMatchObject({
      assetBible: [
        {
          id: 'mia-face',
          label: 'Mia',
          sourceAssetIds: ['photo-1'],
          variantAssetIds: ['face-1'],
          chosenAssetId: 'photo-1',
        },
        { id: 'clock', kind: 'prop', sourceAssetIds: [], variantAssetIds: [] },
      ],
    });
  });

  it('quotes an asset stage with the entry request and starts it with the hash', async () => {
    const { call, started } = setup();
    const quoted = await call('storyboard_video', {
      action: 'quote',
      expectedRevision: 3,
      stage: 'assets',
      entryId: 'mia-face',
      assetAction: 'angles',
      angles: ['left profile'],
    });
    await call('start_storyboard_video', {
      stage: 'assets',
      expectedRevision: 3,
      inputHash: HASH,
      entryId: 'mia-face',
      assetAction: 'angles',
      angles: ['left profile'],
    });
    const request = {
      expectedRevision: 3,
      entryId: 'mia-face',
      action: 'angles',
      angles: ['left profile'],
    };
    expect(quoted.data).toMatchObject({ kind: 'assets', body: request });
    expect(started).toEqual([{ ...request, inputHash: HASH }]);
  });

  it.each([
    [
      'an asset stage without an entry',
      { stage: 'assets', expectedRevision: 3, inputHash: HASH },
      'The assets stage needs entryId and assetAction.',
    ],
    [
      'a final without its quoted shots',
      { stage: 'final', expectedRevision: 3, inputHash: HASH },
      'Pass the quoted shotIds.',
    ],
    [
      'asset fields on a render stage',
      {
        stage: 'draft',
        expectedRevision: 3,
        inputHash: HASH,
        shotIds: ['shot-1'],
        count: 2,
      },
      'Only the assets stage takes entryId, assetAction, count, angles or instruction.',
    ],
  ])('refuses to start %s', async (_label, params, message) => {
    const { call } = setup();
    const result = await call('start_storyboard_video', params);
    expect(result).toMatchObject({ success: false });
    expect(result.error).toContain(message);
  });

  it('estimates what is left, reporting a stage with nothing to do', async () => {
    const { call } = setup();
    const result = await call('storyboard_video', {
      action: 'estimate',
      expectedRevision: 3,
    });
    expect(result.data).toMatchObject({
      stills: { quote: { kind: 'stills', total: 10 } },
      draft: { quote: null, reason: 'Every shot already has a current draft.' },
      final: { quote: { kind: 'renders', total: 40 } },
      total: 50,
    });
  });

  it('assembles the checked finals into an Editor project', async () => {
    const { call } = setup();
    const result = await call('storyboard_video', { action: 'assemble' });
    expect(result.data).toEqual({
      editorProjectId: 'project-1',
      shotIds: ['shot-1'],
    });
  });
});
