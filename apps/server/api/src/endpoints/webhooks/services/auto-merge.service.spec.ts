import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import {
  AutoMergeService,
  autoMergeIdempotencyKey,
} from '@api/endpoints/webhooks/services/auto-merge.service';
import { VideoStitchFixture } from '@api/services/video-stitch/video-stitch.fixture';
import {
  IngredientCategory,
  IngredientStatus,
  VideoEaseCurve,
  VideoTransition,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mergeSettings = {
  isCaptionsEnabled: false,
  isMuteVideoAudio: true,
  transition: VideoTransition.FADE,
  transitionDuration: 0.8,
  transitionEaseCurve: VideoEaseCurve.EASE_IN_OUT_SINE,
};

function groupClip(
  id: string,
  groupIndex: number,
  overrides: Partial<IngredientDocument> = {},
): IngredientDocument {
  return {
    brandId: 'brand-1',
    category: IngredientCategory.VIDEO,
    groupId: 'group-1',
    groupIndex,
    id,
    isMergeEnabled: true,
    mergeSettings,
    organizationId: 'org-1',
    status: IngredientStatus.GENERATED,
    userId: 'user-1',
    ...overrides,
  } as IngredientDocument;
}

describe('AutoMergeService', () => {
  let fixture: VideoStitchFixture;
  let group: IngredientDocument[];
  let ingredientsService: { findAll: ReturnType<typeof vi.fn> };
  let loggerService: Record<
    'debug' | 'error' | 'log' | 'warn',
    ReturnType<typeof vi.fn>
  >;
  let service: AutoMergeService;

  const trigger = async (ingredient: IngredientDocument) => {
    service.triggerAutoMergeIfReady(ingredient);
    await new Promise((resolve) => setImmediate(resolve));
    await vi.waitFor(() => {
      expect(ingredientsService.findAll).toHaveBeenCalled();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  beforeEach(() => {
    fixture = new VideoStitchFixture();
    group = [
      groupClip('clip-1', 0),
      groupClip('clip-2', 1),
      groupClip('clip-3', 2),
    ];
    for (const clip of group) fixture.addClip({ id: clip.id });
    ingredientsService = {
      findAll: vi.fn(async () => ({ docs: group })),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    service = new AutoMergeService(
      ingredientsService as unknown as IngredientsService,
      loggerService as unknown as LoggerService,
      fixture.service,
    );
  });

  it('stitches a completed group with the transition captured at batch start', async () => {
    await trigger(group[2] as IngredientDocument);

    await vi.waitFor(() => expect(fixture.mergeJobs()).toHaveLength(1));
    const [job] = fixture.mergeJobs();
    expect(job?.params).toMatchObject({
      isMuteVideoAudio: true,
      sourceIds: ['clip-1', 'clip-2', 'clip-3'],
      transition: VideoTransition.FADE,
      transitionDuration: 0.8,
      transitionEaseCurve: VideoEaseCurve.EASE_IN_OUT_SINE,
    });
    const [output] = fixture.outputs();
    expect(output).toMatchObject({
      generationSource: 'video-stitch:auto_merge',
      mergeSettings,
      sourceActionId: autoMergeIdempotencyKey('group-1'),
    });
    expect(ingredientsService.findAll).toHaveBeenCalledWith(
      {
        orderBy: { groupIndex: 1 },
        where: {
          category: 'VIDEO',
          groupId: 'group-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      },
      { pagination: false },
      false,
    );
  });

  it('merges with a plain cut when the batch captured no settings', async () => {
    group = group.map((clip) => ({ ...clip, mergeSettings: null }));
    await trigger(group[0] as IngredientDocument);

    await vi.waitFor(() => expect(fixture.mergeJobs()).toHaveLength(1));
    expect(fixture.mergeJobs()[0]?.params).toMatchObject({
      transition: VideoTransition.NONE,
    });
  });

  it('completes the merged output through the stitch service', async () => {
    await trigger(group[0] as IngredientDocument);
    await vi.waitFor(() => expect(fixture.outputs()).toHaveLength(1));
    const [output] = fixture.outputs();
    if (!output) throw new Error('missing output');
    fixture.completeJob(
      `stitch-${output.id}`,
      `ingredients/videos/${output.id}`,
    );

    await vi.waitFor(() =>
      expect(fixture.row(output.id).status).toBe(IngredientStatus.GENERATED),
    );
    expect(fixture.eventsNamed('video.complete')).toHaveLength(1);
  });

  it('never starts a second merge for the same group', async () => {
    await trigger(group[1] as IngredientDocument);
    await vi.waitFor(() => expect(fixture.mergeJobs()).toHaveLength(1));
    await trigger(group[2] as IngredientDocument);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fixture.outputs()).toHaveLength(1);
    expect(fixture.mergeJobs()).toHaveLength(1);
  });

  it('waits until every clip in the group has finished', async () => {
    group[1] = groupClip('clip-2', 1, { status: IngredientStatus.PROCESSING });
    await trigger(group[0] as IngredientDocument);

    expect(fixture.queued).toEqual([]);
    expect(loggerService.debug).toHaveBeenCalledWith(
      'AutoMergeService waiting for all videos to complete',
      { completedCount: 2, groupId: 'group-1', totalCount: 3 },
    );
  });

  it('ignores videos outside a merge-enabled group', async () => {
    service.triggerAutoMergeIfReady(
      groupClip('clip-1', 0, { isMergeEnabled: false }),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(ingredientsService.findAll).not.toHaveBeenCalled();
    expect(fixture.queued).toEqual([]);
  });

  it('logs a refused stitch instead of queuing it', async () => {
    fixture.row('clip-3').isDeleted = true;
    await trigger(group[0] as IngredientDocument);

    await vi.waitFor(() =>
      expect(loggerService.error).toHaveBeenCalledWith(
        'AutoMergeService auto-merge check failed',
        expect.objectContaining({ groupId: 'group-1' }),
      ),
    );
    expect(fixture.queued).toEqual([]);
  });
});
