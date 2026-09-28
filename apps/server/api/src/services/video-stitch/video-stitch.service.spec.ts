import { VideoStitchFixture } from '@api/services/video-stitch/video-stitch.fixture';
import type { VideoStitchRequest } from '@api/services/video-stitch/video-stitch.types';
import {
  ActivityKey,
  IngredientStatus,
  JobState,
  VideoEaseCurve,
  VideoTransition,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/contracts';
import { VIDEO_STITCH_LIMITS } from '@genfeedai/contracts/constants';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

function request(
  overrides: Partial<VideoStitchRequest> = {},
): VideoStitchRequest {
  return {
    brandId: 'brand-1',
    callerKind: 'manual',
    clipIds: ['clip-1', 'clip-2'],
    idempotencyKey: 'key-1',
    organizationId: 'org-1',
    settings: {},
    userId: 'user-1',
    ...overrides,
  };
}

async function failingField(
  promise: Promise<unknown>,
): Promise<string | undefined> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { field: string })
      .field;
  }
  throw new Error('Expected the stitch request to be refused');
}

describe('VideoStitchService', () => {
  let fixture: VideoStitchFixture;

  beforeEach(() => {
    fixture = new VideoStitchFixture();
    fixture.addClip({ id: 'clip-1' });
    fixture.addClip({
      category: 'AVATAR',
      id: 'clip-2',
      s3Key: 'ingredients/avatars/nested/clip-2.mp4',
    });
    fixture.addClip({ category: 'MUSIC', id: 'music-1', s3Key: null });
  });

  describe('contract', () => {
    it('creates one processing output with lineage and queues its deterministic merge job', async () => {
      const handle = await fixture.service.stitch(
        request({
          clipIds: ['clip-2', 'clip-1', 'clip-2'],
          roomUserId: 'auth-user-1',
          settings: {
            isCaptionsEnabled: false,
            isMuteVideoAudio: true,
            music: 'music-1',
            musicVolume: 25,
            transition: VideoTransition.FADE,
            transitionDuration: 0.75,
            transitionEaseCurve: VideoEaseCurve.EASE_IN_OUT_SINE,
          },
        }),
      );

      expect(handle).toEqual({
        isExisting: false,
        jobId: `stitch-${handle.outputId}`,
        organizationId: 'org-1',
        outputId: handle.outputId,
        roomUserId: 'auth-user-1',
        state: 'processing',
      });
      expect(fixture.row(handle.outputId)).toMatchObject({
        brandId: 'brand-1',
        generationSource: 'video-stitch:manual',
        organizationId: 'org-1',
        sourceActionId: 'key-1',
        sources: ['clip-2', 'clip-1'],
        status: IngredientStatus.PROCESSING,
        transformations: ['MERGED'],
        userId: 'user-1',
      });
      expect(fixture.mergeJobs()).toEqual([
        {
          id: handle.jobId,
          ingredientId: handle.outputId,
          organizationId: 'org-1',
          params: {
            isMuteVideoAudio: true,
            isPersistedOutputOnly: true,
            music: 'music-1',
            musicVolume: 0.25,
            sourceIds: ['clip-2', 'clip-1', 'clip-2'],
            sourceStorageKeys: [
              'ingredients/avatars/nested/clip-2.mp4',
              'ingredients/videos/clip-1.mp4',
              'ingredients/avatars/nested/clip-2.mp4',
            ],
            transition: VideoTransition.FADE,
            transitionDuration: 0.75,
            transitionEaseCurve: VideoEaseCurve.EASE_IN_OUT_SINE,
          },
          room: getUserRoomName('auth-user-1'),
          type: 'merge-videos',
          userId: 'user-1',
          websocketUrl: `/videos/${handle.outputId}`,
        },
      ]);
      expect(fixture.eventsNamed('activity.record')[0]?.[0]).toMatchObject({
        entityId: handle.outputId,
        id: `video-stitch:${handle.outputId}`,
        key: ActivityKey.VIDEO_PROCESSING,
        organizationId: 'org-1',
      });
      expect(fixture.eventsNamed('background')[0]?.[0]).toMatchObject({
        label: 'Merging 3 videos',
        progress: 0,
        status: 'processing',
        taskId: handle.outputId,
      });
    });

    it('falls back to the category storage folder when a clip has no usable key', async () => {
      fixture.row('clip-1').s3Key = 'uploads/raw/clip-1.mov';
      fixture.row('clip-2').s3Key = null;
      await fixture.service.stitch(request());
      expect(fixture.mergeJobs()[0]?.params).toMatchObject({
        sourceStorageKeys: [
          'ingredients/videos/clip-1',
          'ingredients/avatars/clip-2',
        ],
      });
    });

    it('maps output dimensions onto the worker resize modes', async () => {
      await fixture.service.stitch(
        request({
          idempotencyKey: 'after',
          output: { height: 1920, resize: 'after_merge', width: 1080 },
        }),
      );
      await fixture.service.stitch(
        request({
          clipIds: ['clip-1'],
          idempotencyKey: 'per-clip',
          output: { height: 1024, resize: 'per_clip', width: 576 },
        }),
      );
      const [afterMerge, perClip] = fixture.mergeJobs();
      expect(afterMerge?.params).toMatchObject({
        height: 1920,
        isResizeEnabled: true,
        width: 1080,
      });
      expect(afterMerge?.params).not.toHaveProperty('normalizeClips');
      expect(perClip?.params).toMatchObject({
        height: 1024,
        normalizeClips: true,
        transition: VideoTransition.NONE,
        width: 576,
      });
      expect(perClip?.params).not.toHaveProperty('isResizeEnabled');
    });
  });

  describe('shared validation', () => {
    it.each([
      ['clipIds', request({ clipIds: ['clip-1'] })],
      [
        'clipIds',
        request({
          clipIds: Array.from(
            { length: VIDEO_STITCH_LIMITS.MAX_CLIPS + 1 },
            () => 'clip-1',
          ),
        }),
      ],
      [
        'transition',
        request({ settings: { transition: 'morph' as VideoTransition } }),
      ],
      ['transitionDuration', request({ settings: { transitionDuration: 3 } })],
      [
        'transitionEaseCurve',
        request({
          settings: { transitionEaseCurve: 'bounce' as VideoEaseCurve },
        }),
      ],
      ['musicVolume', request({ settings: { musicVolume: 101 } })],
      ['brandId', request({ brandId: '' })],
      ['idempotencyKey', request({ idempotencyKey: ' ' })],
      [
        'output',
        request({
          output: { height: 1920.5, resize: 'after_merge', width: 1080 },
        }),
      ],
      [
        'music',
        request({
          output: { height: 1024, resize: 'per_clip', width: 576 },
          settings: { music: 'music-1' },
        }),
      ],
      [
        'transition',
        request({
          output: { height: 1024, resize: 'per_clip', width: 576 },
          settings: { transition: VideoTransition.FADE },
        }),
      ],
    ])(
      'refuses an invalid %s before creating or queuing anything',
      async (field, invalid) => {
        expect(await failingField(fixture.service.stitch(invalid))).toBe(field);
        expect(fixture.outputs()).toEqual([]);
        expect(fixture.queued).toEqual([]);
      },
    );

    it('accepts the largest interpolation sequence (50 pairs plus the loop pair)', async () => {
      const clipIds = Array.from(
        { length: VIDEO_STITCH_LIMITS.MAX_CLIPS },
        (_, index) => (index % 2 === 0 ? 'clip-1' : 'clip-2'),
      );
      await expect(
        fixture.service.stitch(request({ clipIds })),
      ).resolves.toMatchObject({ state: 'processing' });
    });

    it.each([
      ['another organization', { organizationId: 'org-2' }],
      ['another brand', { brandId: 'brand-2' }],
      ['a soft-deleted clip', { isDeleted: true }],
      ['an unfinished clip', { status: IngredientStatus.PROCESSING }],
      ['a stored-less draft', { s3Key: null, status: IngredientStatus.DRAFT }],
      ['an image', { category: 'IMAGE' }],
    ])('refuses %s on the clipIds field', async (_label, override) => {
      Object.assign(fixture.row('clip-2'), override);
      expect(await failingField(fixture.service.stitch(request()))).toBe(
        'clipIds',
      );
      expect(fixture.queued).toEqual([]);
    });

    it('accepts uploaded clips and drafts whose media is stored', async () => {
      fixture.row('clip-1').status = IngredientStatus.UPLOADED;
      fixture.row('clip-2').status = IngredientStatus.DRAFT;
      await expect(fixture.service.stitch(request())).resolves.toMatchObject({
        state: 'processing',
      });
    });

    it('refuses music from another organization', async () => {
      fixture.row('music-1').organizationId = 'org-2';
      expect(
        await failingField(
          fixture.service.stitch(request({ settings: { music: 'music-1' } })),
        ),
      ).toBe('music');
    });
  });

  describe('idempotency', () => {
    it('returns the existing output for a repeated key without a second job', async () => {
      const first = await fixture.service.stitch(request());
      const second = await fixture.service.stitch(request());
      expect(second).toEqual({
        isExisting: true,
        jobId: first.jobId,
        organizationId: 'org-1',
        outputId: first.outputId,
        state: 'processing',
      });
      expect(fixture.outputs()).toHaveLength(1);
      expect(fixture.mergeJobs()).toHaveLength(1);
    });

    it('keeps one output when two requests with one key race', async () => {
      const [first, second] = await Promise.all([
        fixture.service.stitch(request()),
        fixture.service.stitch(request()),
      ]);
      expect(second.outputId).toBe(first.outputId);
      expect(fixture.outputs()).toHaveLength(1);
      expect(fixture.mergeJobs()).toHaveLength(1);
    });

    it('scopes keys to the organization', async () => {
      fixture.addClip({ id: 'clip-3', organizationId: 'org-2' });
      fixture.addClip({ id: 'clip-4', organizationId: 'org-2' });
      await fixture.service.stitch(request());
      const other = await fixture.service.stitch(
        request({ clipIds: ['clip-3', 'clip-4'], organizationId: 'org-2' }),
      );
      expect(other.isExisting).toBe(false);
      expect(fixture.mergeJobs()).toHaveLength(2);
    });
  });

  describe('completion', () => {
    it('persists the worker output and emits the completion events once', async () => {
      const handle = await fixture.service.stitch(
        request({ roomUserId: 'auth-user-1' }),
      );
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );

      const [waited, settled] = await Promise.all([
        fixture.service.waitForCompletion(handle),
        fixture.service.settle(handle),
      ]);

      expect(waited).toMatchObject({
        s3Key: `ingredients/videos/${handle.outputId}`,
        state: 'generated',
      });
      expect(settled.state).toBe('generated');
      expect(fixture.row(handle.outputId)).toMatchObject({
        s3Key: `ingredients/videos/${handle.outputId}`,
        status: IngredientStatus.GENERATED,
      });
      expect(fixture.eventsNamed('video.complete')).toEqual([
        [
          `/videos/${handle.outputId}`,
          {
            eventType: WebSocketEventType.VIDEO_MERGED,
            id: handle.outputId,
            status: WebSocketEventStatus.COMPLETED,
            transformation: 'MERGED',
          },
          'auth-user-1',
          getUserRoomName('auth-user-1'),
        ],
      ]);
      expect(fixture.eventsNamed('metadata.update')[0]?.[1]).toEqual({
        duration: 12,
        height: 1920,
        result: `ingredients/videos/${handle.outputId}`,
        size: 2048,
        width: 1080,
      });
    });

    it('burns in captions when the request asked for them', async () => {
      const handle = await fixture.service.stitch(
        request({ settings: { isCaptionsEnabled: true } }),
      );
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );
      await fixture.service.waitForCompletion(handle);

      expect(fixture.eventsNamed('whisper')).toEqual([[handle.outputId]]);
      expect(fixture.queued.at(-1)).toMatchObject({
        params: {
          captionContent: 'caption content',
          s3Key: `ingredients/videos/${handle.outputId}`,
        },
        type: 'add-captions',
      });
      expect(fixture.row(handle.outputId).status).toBe(
        IngredientStatus.GENERATED,
      );
    });

    it('marks the output failed with the error and emits the failure events', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.failWaitFor.set(handle.jobId, new Error('ffmpeg exited'));

      await expect(
        fixture.service.waitForCompletion(handle),
      ).resolves.toMatchObject({ error: 'ffmpeg exited', state: 'failed' });
      expect(fixture.row(handle.outputId)).toMatchObject({
        generationError: 'ffmpeg exited',
        status: IngredientStatus.FAILED,
      });
      expect(fixture.eventsNamed('media.failed')).toHaveLength(1);
      expect(fixture.eventsNamed('background').at(-1)?.[0]).toMatchObject({
        error: 'ffmpeg exited',
        label: 'Merge failed',
        status: 'failed',
      });
      const logged = JSON.stringify(fixture.eventsNamed('log.error'));
      expect(logged).toContain(handle.outputId);
      expect(logged).not.toContain('https://');
    });

    it('rejects a result that is not a persisted video', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.jobStates.set(handle.jobId, JobState.COMPLETED);
      fixture.jobResults.set(handle.jobId, {
        outputPath: '/tmp/merged.mp4',
        success: true,
      });
      await expect(fixture.service.settle(handle)).resolves.toMatchObject({
        error: 'Video merge did not return a persisted video',
        state: 'failed',
      });
    });

    it('reports a still-running job as processing without touching the output', async () => {
      const handle = await fixture.service.stitch(request());
      await expect(fixture.service.settle(handle)).resolves.toEqual({
        jobId: handle.jobId,
        outputId: handle.outputId,
        state: 'processing',
      });
      expect(fixture.row(handle.outputId).status).toBe(
        IngredientStatus.PROCESSING,
      );
    });
  });

  describe('retry', () => {
    it('requeues a failed output under the same job id', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.jobStates.set(handle.jobId, JobState.FAILED);
      await fixture.service.settle(handle);

      const retried = await fixture.service.retry(request(), handle);

      expect(retried).toMatchObject({
        jobId: handle.jobId,
        outputId: handle.outputId,
        state: 'processing',
      });
      expect(fixture.row(handle.outputId).status).toBe(
        IngredientStatus.PROCESSING,
      );
      expect(fixture.mergeJobs().map((job) => job.id)).toEqual([
        handle.jobId,
        handle.jobId,
      ]);
    });

    it('leaves an output that has not failed alone', async () => {
      const handle = await fixture.service.stitch(request());
      const retried = await fixture.service.retry(request(), {
        ...handle,
        jobId: 'legacy-job',
      });
      expect(retried).toMatchObject({
        jobId: 'legacy-job',
        state: 'processing',
      });
      expect(fixture.mergeJobs()).toHaveLength(1);
    });
  });
});
