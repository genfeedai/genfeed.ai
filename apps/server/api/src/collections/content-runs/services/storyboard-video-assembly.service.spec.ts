import { shotRenderInputFingerprint } from '@api/collections/content-runs/services/storyboard-shot-render-state';
import { StoryboardVideoAssemblyService } from '@api/collections/content-runs/services/storyboard-video-assembly.service';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { IEditorTrack } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const QA = {
  state: 'passed' as const,
  failures: [],
  checkedAt: '2026-11-07T12:10:00.000Z',
};

function shot(id: string, ordinal: number, action: string) {
  return {
    id,
    ordinal,
    action,
    onScreenSpeaker: false,
    durationSeconds: 6,
    stillFreshness: 'missing' as const,
    transition: 'cut' as const,
  };
}

const plan: StoryboardPlan = {
  videoModelKey: 'acme/cine-2',
  title: 'Late',
  logline: '',
  format: '9:16',
  runtimeBudgetSeconds: 12,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [shot('shot-1', 1, 'Mia wakes.'), shot('shot-2', 2, 'Mia runs.')],
};

function finalOp(shotId: string, assetId: string, qa: object | null) {
  return {
    version: 1,
    operationId: crypto.randomUUID(),
    shotId,
    stage: 'final',
    actorUserId: 'user-1',
    modelKey: 'acme/cine-2',
    credits: 20,
    billingMode: 'platform',
    // Current: rendered from the shot as the plan has it now.
    inputFingerprint: shotRenderInputFingerprint(
      plan,
      plan.shots.find((item) => item.id === shotId) ?? plan.shots[0],
      'final',
    ),
    prompt: 'A shot.',
    referenceAssetIds: [],
    aspectRatio: '9:16',
    durationSeconds: 6,
    isAudioEnabled: true,
    createdAt: '2026-11-07T12:00:00.000Z',
    updatedAt: '2026-11-07T12:00:00.000Z',
    state: 'ready',
    assetId,
    billing: 'settled',
    ...(qa ? { qa } : {}),
  };
}

function setup(secondQa: object | null = QA) {
  const created: { tracks: IEditorTrack[]; config: Record<string, unknown> }[] =
    [];
  const store = {
    read: async () => ({
      record: {
        id: 'run-1',
        brandId: 'brand-1',
        organizationId: 'org-1',
        createdAt: new Date('2026-11-07T12:00:00.000Z'),
        updatedAt: new Date('2026-11-07T12:00:00.000Z'),
        config: {
          origin: 'native',
          contract: 'storyboard-run',
          version: 1,
          revision: 4,
          approvedRevision: 4,
          state: 'approved',
          clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
          createdByUserId: 'user-1',
          submittedInputHash: 'a'.repeat(64),
          sourceSnapshot: {
            selector: { kind: 'brief', brief: 'Mia is late.' },
            capturedAt: '2026-11-07T12:00:00.000Z',
          },
          plan,
          shotRenderOperations: [
            finalOp('shot-1', 'clip-1', QA),
            finalOp('shot-2', 'clip-2', secondQa),
          ],
        },
      },
    }),
  };
  const prisma = {
    ingredient: {
      findMany: async () => [
        {
          id: 'clip-1',
          category: 'VIDEO',
          status: 'GENERATED',
          metadata: { duration: 5 },
        },
        {
          id: 'clip-2',
          category: 'VIDEO',
          status: 'GENERATED',
          metadata: { duration: 8 },
        },
      ],
    },
  };
  const editorProjects = {
    create: async (input: (typeof created)[number]) => {
      created.push(input);
      return { id: 'project-1' };
    },
  };
  const service = new StoryboardVideoAssemblyService(
    prisma as never,
    store as never,
    editorProjects as never,
    { ingredientsEndpoint: 'https://cdn.test' } as never,
  );
  const user = { organizationId: 'org-1', id: 'user-1', userId: 'user-1' };
  return {
    created,
    assemble: () => service.assemble(user as never, 'brand-1', 'run-1'),
  };
}

describe('StoryboardVideoAssemblyService', () => {
  it('lays the checked finals back to back in shot order, each no longer than its clip', async () => {
    const context = setup();
    const result = await context.assemble();
    expect(result).toEqual({
      editorProjectId: 'project-1',
      shotIds: ['shot-1', 'shot-2'],
    });
    expect(
      context.created[0]?.tracks[0]?.clips.map((clip) => ({
        ingredientId: clip.ingredientId,
        startFrame: clip.startFrame,
        durationFrames: clip.durationFrames,
      })),
    ).toEqual([
      { ingredientId: 'clip-1', startFrame: 0, durationFrames: 150 },
      { ingredientId: 'clip-2', startFrame: 150, durationFrames: 180 },
    ]);
    expect(context.created[0]?.config).toMatchObject({
      totalDurationFrames: 330,
      storyboardRunId: 'run-1',
      settings: { width: 1080, height: 1920, fps: 30 },
    });
  });

  it.each([
    ['failed QA', { ...QA, state: 'failed' }],
    ['not been checked yet', null],
  ])('refuses while a final has %s', async (_label, qa) => {
    const context = setup(qa);
    await expect(context.assemble()).rejects.toThrow(
      'Render and check the final of shot 2 first.',
    );
    expect(context.created).toEqual([]);
  });
});
