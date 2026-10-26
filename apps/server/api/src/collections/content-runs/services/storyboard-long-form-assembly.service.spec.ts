import { planStoryboardARollChunks } from '@api/collections/content-runs/services/storyboard-a-roll-plan';
import { storyboardStoredRunConfigSchema } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { StoryboardLongFormAssemblyService } from '@api/collections/content-runs/services/storyboard-long-form-assembly.service';
import type { StoryboardARollChunk } from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import type { StoryboardCutaway } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardNativeRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const SENTENCE = `${'word '.repeat(19)}end.`;
const NARRATION = Array.from({ length: 10 }, () => SENTENCE).join(' ');

function config(
  cutaways: StoryboardCutaway[] = [],
  chunkStates: Partial<StoryboardARollChunk>[] = [{}],
): StoryboardNativeRunConfig {
  const base: StoryboardNativeRunConfig = {
    origin: 'native',
    contract: 'storyboard-run',
    version: 1,
    revision: 3,
    approvedRevision: 3,
    state: 'approved',
    clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
    createdByUserId: 'user-1',
    submittedInputHash: 'a'.repeat(64),
    sourceSnapshot: {
      selector: { kind: 'brief', brief: 'Pricing', length: 'long_form' },
      capturedAt: '2026-10-26T12:00:00.000Z',
    },
    plan: {
      videoModelKey: null,
      title: 'Pricing',
      logline: '',
      format: '16:9',
      runtimeBudgetSeconds: null,
      styleReferenceAssetIds: [],
      cast: [
        {
          id: 'presenter',
          name: 'Presenter',
          avatarAssetId: 'avatar-1',
          voiceId: 'voice-1',
          referenceAssetIds: [],
        },
      ],
      shots: [],
      longForm: {
        runtimeBudgetSeconds: 600,
        presenterId: 'presenter',
        segments: [
          {
            id: 'segment-1',
            ordinal: 1,
            narration: NARRATION,
            estimatedSeconds: 84,
            cutaways,
          },
        ],
      },
    },
  };
  const planned = planStoryboardARollChunks(base.plan);
  return {
    ...base,
    aRoll: {
      presenterId: 'presenter',
      modelKey: 'heygen/avatar-iv',
      chunks: planned.map((input, index) => ({
        id: `0000000${index + 1}-0000-4000-8000-000000000000`,
        ordinal: index + 1,
        ...input,
        state: 'ready',
        assetId: `presenter-${index + 1}`,
        durationSeconds: 42,
        actorUserId: 'user-1',
        credits: 0,
        billingMode: 'byok',
        createdAt: '2026-10-26T12:00:00.000Z',
        updatedAt: '2026-10-26T12:00:00.000Z',
        ...chunkStates[index],
      })),
    },
  };
}

function setup(initial: StoryboardNativeRunConfig) {
  const store = {
    read: vi.fn(async () => ({
      record: {},
      config: storyboardStoredRunConfigSchema.parse(structuredClone(initial)),
    })),
  };
  const prisma = {
    ingredient: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({
          id,
          category: id.startsWith('presenter')
            ? 'AVATAR'
            : id.startsWith('still') || id.startsWith('avatar')
              ? 'IMAGE'
              : id.startsWith('speech')
                ? 'VOICE'
                : 'VIDEO',
          status: 'GENERATED',
          metadata: { duration: id === 'short-clip' ? 2 : 60 },
        })),
      ),
    },
  };
  const editorProjects = {
    create: vi.fn(async (_dto: unknown) => ({ id: 'project-1' })),
  };
  const service = new StoryboardLongFormAssemblyService(
    prisma as never,
    store as never,
    editorProjects as never,
    { ingredientsEndpoint: 'https://cdn.test/ingredients' } as never,
  );
  return { service, editorProjects };
}

const user = { id: 'user-1', userId: 'user-1', organizationId: 'org-1' };

describe('StoryboardLongFormAssemblyService', () => {
  it('opens the presenter and B-roll as an Editor project', async () => {
    const ctx = setup(
      config([
        {
          id: 'cutaway-1',
          kind: 'library_clip',
          brief: 'Desk',
          assetId: 'clip-1',
          startSeconds: 20,
          durationSeconds: 5,
        },
      ]),
    );

    const result = await ctx.service.assemble(
      user as never,
      'brand-1',
      'run-1',
      'aRoll',
    );

    expect(result.editorProjectId).toBe('project-1');
    const created = ctx.editorProjects.create.mock.calls[0]?.[0] as {
      config: { totalDurationFrames: number; settings: { width: number } };
      tracks: {
        name: string;
        volume: number;
        clips: { ingredientUrl: string; startFrame: number }[];
      }[];
    };
    expect(created.config.totalDurationFrames).toBe(42 * 30);
    expect(created.config.settings.width).toBe(1920);
    expect(created.tracks.map((track) => track.name)).toEqual([
      'Presenter',
      'B-roll',
    ]);
    expect(created.tracks[0]?.clips[0]?.ingredientUrl).toBe(
      'https://cdn.test/ingredients/avatars/presenter-1',
    );
    expect(created.tracks[1]?.volume).toBe(0);
    expect(created.tracks[1]?.clips).toHaveLength(1);
  });

  it('refuses until every chunk of the narration is rendered', async () => {
    const ctx = setup(config([], [{ state: 'submitted' }]));

    await expect(
      ctx.service.assemble(user as never, 'brand-1', 'run-1', 'aRoll'),
    ).rejects.toThrow('Render the presenter track');
  });

  it('refuses cutaways without footage', async () => {
    const ctx = setup(
      config([
        {
          id: 'cutaway-1',
          kind: 'still',
          brief: 'Chart',
          startSeconds: 20,
          durationSeconds: 5,
        },
      ]),
    );

    await expect(
      ctx.service.assemble(user as never, 'brand-1', 'run-1', 'aRoll'),
    ).rejects.toThrow(ConflictException);
    expect(ctx.editorProjects.create).not.toHaveBeenCalled();
  });

  it('keeps a short clip to its own length', async () => {
    const ctx = setup(
      config([
        {
          id: 'cutaway-1',
          kind: 'library_clip',
          brief: 'Desk',
          assetId: 'short-clip',
          startSeconds: 20,
          durationSeconds: 8,
        },
      ]),
    );

    await ctx.service.assemble(user as never, 'brand-1', 'run-1', 'aRoll');
    const created = ctx.editorProjects.create.mock.calls[0]?.[0] as {
      tracks: { clips: { durationFrames: number }[] }[];
    };
    expect(created.tracks[1]?.clips[0]?.durationFrames).toBe(60);
  });

  it('shows a still cutaway with a push-in for its whole slot', async () => {
    const ctx = setup(
      config([
        {
          id: 'cutaway-1',
          kind: 'still',
          brief: 'Chart',
          assetId: 'still-1',
          startSeconds: 20,
          durationSeconds: 8,
        },
      ]),
    );

    await ctx.service.assemble(user as never, 'brand-1', 'run-1', 'aRoll');
    const created = ctx.editorProjects.create.mock.calls[0]?.[0] as {
      tracks: { clips: { durationFrames: number; mediaType?: string }[] }[];
    };
    expect(created.tracks[1]?.clips[0]?.mediaType).toBe('image');
    expect(created.tracks[1]?.clips[0]?.durationFrames).toBeGreaterThan(60);
  });

  it('opens the animatic as the photo, the speech and the ready B-roll', async () => {
    const final = config([
      {
        id: 'cutaway-1',
        kind: 'still',
        brief: 'Chart',
        startSeconds: 20,
        durationSeconds: 5,
      },
    ]);
    const ctx = setup({
      ...final,
      state: 'storyboard',
      approvedRevision: undefined,
      aRoll: undefined,
      animatic: final.aRoll
        ? {
            ...final.aRoll,
            chunks: final.aRoll.chunks.map((chunk, index) => ({
              ...chunk,
              assetId: `speech-${index + 1}`,
            })),
          }
        : undefined,
    });

    await ctx.service.assemble(user as never, 'brand-1', 'run-1', 'animatic');
    const created = ctx.editorProjects.create.mock.calls[0]?.[0] as {
      config: { name: string };
      tracks: {
        name: string;
        type: string;
        clips: { ingredientId: string; mediaType?: string }[];
      }[];
    };
    expect(created.config.name).toBe('Pricing (animatic)');
    expect(
      created.tracks.map((track) => [track.name, track.clips.length]),
    ).toEqual([
      ['Presenter', 1],
      ['B-roll', 0],
      ['Narration', 1],
    ]);
    expect(created.tracks[0]?.clips[0]).toMatchObject({
      ingredientId: 'avatar-1',
      mediaType: 'image',
    });
    expect(created.tracks[2]?.type).toBe('audio');
  });
});
