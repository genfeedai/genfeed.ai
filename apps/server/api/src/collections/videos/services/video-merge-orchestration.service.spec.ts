import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import {
  toManualStitchRequest,
  VideoMergeOrchestrationService,
} from '@api/collections/videos/services/video-merge-orchestration.service';
import { VideoStitchFixture } from '@api/services/video-stitch/video-stitch.fixture';
import {
  IngredientCategory,
  IngredientStatus,
  VideoEaseCurve,
  VideoTransition,
} from '@genfeedai/contracts';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VideoMergeOrchestrationService', () => {
  const user = {
    brandId: 'brand-1',
    id: 'auth-user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as User;

  const makeDto = (
    overrides: Partial<CreateMergedVideoDto> = {},
  ): CreateMergedVideoDto =>
    ({
      category: IngredientCategory.VIDEO,
      ids: ['clip-1', 'clip-2'],
      ...overrides,
    }) as CreateMergedVideoDto;

  let fixture: VideoStitchFixture;
  let ingredientsService: { findOne: ReturnType<typeof vi.fn> };
  let service: VideoMergeOrchestrationService;

  beforeEach(() => {
    fixture = new VideoStitchFixture();
    fixture.addClip({ id: 'clip-1' });
    fixture.addClip({ id: 'clip-2' });
    fixture.addClip({ category: 'MUSIC', id: 'music-1', s3Key: null });
    ingredientsService = {
      findOne: vi.fn(async ({ id }: { id: string }) => fixture.rows.get(id)),
    };
    service = new VideoMergeOrchestrationService(
      ingredientsService as unknown as IngredientsService,
      fixture.service,
    );
  });

  it('maps every merge option onto the shared stitch contract', () => {
    expect(
      toManualStitchRequest(
        user,
        makeDto({
          isCaptionsEnabled: true,
          isMuteVideoAudio: true,
          isResizeEnabled: true,
          music: 'music-1',
          musicVolume: 25,
          transition: VideoTransition.FADE,
          transitionDuration: 0.75,
          transitionEaseCurve: VideoEaseCurve.EASE_IN_OUT_SINE,
        }),
        'manual:key',
      ),
    ).toEqual({
      brandId: 'brand-1',
      callerKind: 'manual',
      clipIds: ['clip-1', 'clip-2'],
      idempotencyKey: 'manual:key',
      organizationId: 'org-1',
      output: { height: 1920, resize: 'after_merge', width: 1080 },
      roomUserId: 'auth-user-1',
      settings: {
        isCaptionsEnabled: true,
        isMuteVideoAudio: true,
        music: 'music-1',
        musicVolume: 25,
        transition: VideoTransition.FADE,
        transitionDuration: 0.75,
        transitionEaseCurve: VideoEaseCurve.EASE_IN_OUT_SINE,
      },
      userId: 'user-1',
    });
  });

  it.each([
    { zoomEaseCurve: VideoEaseCurve.EASE_IN_OUT_CUBIC },
    { zoomConfigs: [{ startZoom: 1, endZoom: 1.2 }] },
  ])('rejects unsupported zoom before creating a merge', async (zoom) => {
    await expect(service.mergeVideos(user, makeDto(zoom))).rejects.toThrow(
      'Zoom effects are not supported when merging videos',
    );
    expect(fixture.queued).toEqual([]);
    expect(fixture.outputs()).toEqual([]);
  });

  it('returns the processing output before the merge job finishes', async () => {
    const output = await service.mergeVideos(
      user,
      makeDto({ ids: ['clip-1', 'clip-1', 'clip-2'] }),
    );

    expect(output).toMatchObject({
      generationSource: 'video-stitch:manual',
      status: IngredientStatus.PROCESSING,
    });
    expect(ingredientsService.findOne).toHaveBeenCalledWith({
      id: output.id,
      isDeleted: false,
      organizationId: 'org-1',
    });
    const [job] = fixture.mergeJobs();
    expect(job).toMatchObject({
      id: `stitch-${output.id}`,
      params: { sourceIds: ['clip-1', 'clip-1', 'clip-2'] },
      room: getUserRoomName('auth-user-1'),
      userId: 'user-1',
    });
  });

  it('completes the merge in the background with the chosen transition', async () => {
    const dto = makeDto({
      isResizeEnabled: true,
      transition: VideoTransition.WIPELEFT,
      transitionDuration: 1,
    });
    const output = await service.mergeVideos(user, dto);
    fixture.completeJob(
      `stitch-${output.id}`,
      `ingredients/videos/${output.id}`,
    );

    await vi.waitFor(() => {
      expect(fixture.row(output.id).status).toBe(IngredientStatus.GENERATED);
    });
    expect(fixture.mergeJobs()[0]?.params).toMatchObject({
      height: 1920,
      isResizeEnabled: true,
      transition: VideoTransition.WIPELEFT,
      transitionDuration: 1,
      width: 1080,
    });
    expect(fixture.eventsNamed('video.complete')).toHaveLength(1);
  });

  it('refuses unavailable clips with the failing field before queuing', async () => {
    fixture.row('clip-2').brandId = 'brand-2';

    const refusal = service.mergeVideos(user, makeDto());

    await expect(refusal).rejects.toBeInstanceOf(BadRequestException);
    await expect(refusal).rejects.toMatchObject({
      response: {
        detail: 'Found 1 of 2 videos ready to merge',
        field: 'clipIds',
        title: 'Videos not available',
      },
    });
    expect(fixture.outputs()).toEqual([]);
    expect(fixture.queued).toEqual([]);
  });

  it('refuses a transition duration outside the shared bounds', async () => {
    await expect(
      service.mergeVideos(user, makeDto({ transitionDuration: 5 })),
    ).rejects.toMatchObject({ response: { field: 'transitionDuration' } });
    expect(fixture.queued).toEqual([]);
  });

  it('gives every manual request its own idempotency key', async () => {
    const first = await service.mergeVideos(user, makeDto());
    const second = await service.mergeVideos(user, makeDto());

    expect(second.id).not.toBe(first.id);
    expect(fixture.row(first.id).sourceActionId).toMatch(/^manual:/);
    expect(fixture.row(second.id).sourceActionId).not.toBe(
      fixture.row(first.id).sourceActionId,
    );
  });

  it('settles a failed worker job as a failed output', async () => {
    fixture.failWaitFor.set('stitch-output-1', new Error('queue unavailable'));

    const output = await service.mergeVideos(user, makeDto());

    await vi.waitFor(() => {
      expect(fixture.row(output.id)).toMatchObject({
        generationError: 'queue unavailable',
        status: IngredientStatus.FAILED,
      });
    });
    expect(fixture.eventsNamed('media.failed')[0]).toEqual([
      `/videos/${output.id}`,
      'Failed to merge videos: queue unavailable',
      'auth-user-1',
      getUserRoomName('auth-user-1'),
    ]);
  });
});
