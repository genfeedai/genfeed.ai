import { VideoStitchFixture } from '@api/services/video-stitch/video-stitch.fixture';
import type { VideoStitchRequest } from '@api/services/video-stitch/video-stitch.types';
import {
  ActivityKey,
  IngredientStatus,
  JobState,
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

  describe('authorized storage sources', () => {
    const activatedFixture = () => {
      const active = new VideoStitchFixture(true);
      active.addClip({
        id: 'clip-1',
        s3Key: 'ingredients/videos/random-clip-one',
      });
      active.addClip({
        id: 'clip-2',
        s3Key: 'ingredients/videos/random-clip-two',
      });
      active.addClip({
        category: 'MUSIC',
        id: 'music-1',
        s3Key: 'ingredients/musics/random-track',
      });
      return active;
    };

    it('preserves literal whitespace and reserved characters in activated source identities', async () => {
      const active = activatedFixture();
      const clipKey = 'ingredients/videos/clip %2F?#.mp4';
      const musicKey = 'ingredients/musics/track %2F?#.wav';
      active.row('clip-1').s3Key = clipKey;
      active.row('music-1').s3Key = musicKey;
      await active.service.stitch(request({ settings: { music: 'music-1' } }));
      expect(active.queued[0]?.params).toMatchObject({
        sourceStorageKeys: [clipKey, 'ingredients/videos/random-clip-two'],
        musicStorageKey: musicKey,
      });
    });

    it('passes canonical ordered source and music keys from scoped records to the worker', async () => {
      const active = activatedFixture();
      await active.service.stitch(
        request({
          clipIds: ['clip-2', 'clip-1', 'clip-2'],
          settings: { music: 'music-1' },
        }),
      );
      expect(active.queued[0]?.params).toMatchObject({
        sourceStorageKeys: [
          'ingredients/videos/random-clip-two',
          'ingredients/videos/random-clip-one',
          'ingredients/videos/random-clip-two',
        ],
        musicStorageKey: 'ingredients/musics/random-track',
      });
    });

    it('rejects keyless clips before creating output or enqueueing work', async () => {
      const active = activatedFixture();
      active.row('clip-1').s3Key = null;
      expect(await failingField(active.service.stitch(request()))).toBe(
        'clipIds',
      );
      expect(active.outputs()).toHaveLength(0);
      expect(active.queued).toHaveLength(0);
    });

    it.each(['keyless', 'cross-organization'] as const)(
      'rejects %s music before enqueueing work',
      async (kind) => {
        const active = activatedFixture();
        if (kind === 'keyless') active.row('music-1').s3Key = null;
        else active.row('music-1').organizationId = 'org-2';
        expect(
          await failingField(
            active.service.stitch(request({ settings: { music: 'music-1' } })),
          ),
        ).toBe('music');
        expect(active.outputs()).toHaveLength(0);
        expect(active.queued).toHaveLength(0);
      },
    );
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

    it('accepts a global default music track', async () => {
      fixture.addClip({
        category: 'MUSIC',
        id: 'default-track',
        isDefault: true,
        organizationId: null,
        s3Key: null,
      });
      await expect(
        fixture.service.stitch(
          request({ settings: { music: 'default-track' } }),
        ),
      ).resolves.toMatchObject({ state: 'processing' });
    });

    it('refuses a global music track that is not a default', async () => {
      fixture.addClip({
        category: 'MUSIC',
        id: 'global-track',
        isDefault: false,
        organizationId: null,
        s3Key: null,
      });
      expect(
        await failingField(
          fixture.service.stitch(
            request({ settings: { music: 'global-track' } }),
          ),
        ),
      ).toBe('music');
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

  describe('single-clip rule (keyed on output mode)', () => {
    it('accepts one clip when finalizing a sequence (interpolation auto-merge)', async () => {
      const handle = await fixture.service.stitch(
        request({
          callerKind: 'auto_merge',
          clipIds: ['clip-1'],
          mode: 'finalize',
        }),
      );
      expect(handle.state).toBe('processing');
      expect(fixture.mergeJobs()[0]?.params).toMatchObject({
        sourceIds: ['clip-1'],
        transition: VideoTransition.NONE,
      });
    });

    it('refuses one clip for an explicit join before queuing', async () => {
      expect(
        await failingField(
          fixture.service.stitch(
            request({ clipIds: ['clip-1'], mode: 'join' }),
          ),
        ),
      ).toBe('clipIds');
      expect(fixture.queued).toEqual([]);
    });

    it('accepts one clip for a per-clip-normalized output', async () => {
      const handle = await fixture.service.stitch(
        request({
          callerKind: 'storyboard_run',
          clipIds: ['clip-1'],
          output: { height: 1024, resize: 'per_clip', width: 576 },
        }),
      );
      expect(handle.state).toBe('processing');
      expect(fixture.mergeJobs()[0]?.params).toMatchObject({
        normalizeClips: true,
        sourceIds: ['clip-1'],
      });
    });

    it.each([
      ['a plain stitch', undefined],
      [
        'an after-merge resize',
        { height: 1920, resize: 'after_merge' as const, width: 1080 },
      ],
    ])('refuses one clip for %s before queuing', async (_label, output) => {
      expect(
        await failingField(
          fixture.service.stitch(
            request({
              callerKind: 'storyboard_run',
              clipIds: ['clip-1'],
              ...(output ? { output } : {}),
            }),
          ),
        ),
      ).toBe('clipIds');
      expect(fixture.outputs()).toEqual([]);
      expect(fixture.queued).toEqual([]);
    });
  });

  describe('workflow lineage', () => {
    it('links the output to the workflow execution that produced it', async () => {
      const handle = await fixture.service.stitch(
        request({ callerKind: 'workflow', workflowExecutionId: 'exec-1' }),
      );
      expect(fixture.row(handle.outputId).workflowExecutionId).toBe('exec-1');
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

    it('keeps one output and one job when requests with one key race', async () => {
      const results = await Promise.all([
        fixture.service.stitch(request()),
        fixture.service.stitch(request()),
        fixture.service.stitch(request()),
      ]);
      expect(new Set(results.map((handle) => handle.outputId)).size).toBe(1);
      expect(results.filter((handle) => handle.isExisting)).toHaveLength(2);
      expect(fixture.outputs()).toHaveLength(1);
      expect(fixture.mergeJobs()).toHaveLength(1);
    });

    it('never returns a non-stitch asset that reuses the key', async () => {
      fixture.addClip({
        generationSource: 'image-retry',
        id: 'unrelated-video',
        sourceActionId: 'key-1',
      });

      const handle = await fixture.service.stitch(request());

      expect(handle.isExisting).toBe(false);
      expect(handle.outputId).not.toBe('unrelated-video');
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

      const outcomes = await Promise.all([
        fixture.service.waitForCompletion(handle),
        fixture.service.settle(handle),
      ]);

      // One completer settles it; the other defers to it without repeating
      // any work.
      expect(outcomes).toContainEqual({
        jobId: handle.jobId,
        outputId: handle.outputId,
        s3Key: `ingredients/videos/${handle.outputId}`,
        state: 'generated',
      });
      await expect(fixture.service.settle(handle)).resolves.toMatchObject({
        state: 'generated',
      });
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

    it('records the captioned file size, not the intermediate merge size', async () => {
      const handle = await fixture.service.stitch(
        request({ settings: { isCaptionsEnabled: true } }),
      );
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );

      await fixture.service.waitForCompletion(handle);

      expect(fixture.eventsNamed('metadata.update')[0]?.[1]).toMatchObject({
        duration: 12,
        size: 4096,
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

    it('transcribes the unmuted merge, then mutes the captioned output', async () => {
      const handle = await fixture.service.stitch(
        request({
          settings: { isCaptionsEnabled: true, isMuteVideoAudio: true },
        }),
      );
      expect(fixture.mergeJobs()[0]?.params).not.toHaveProperty(
        'isMuteVideoAudio',
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
          isMuteVideoAudio: true,
        },
        type: 'add-captions',
      });
    });

    it('still mutes the output when caption transcription fails', async () => {
      fixture.isTranscriptionFailing = true;
      const handle = await fixture.service.stitch(
        request({
          settings: { isCaptionsEnabled: true, isMuteVideoAudio: true },
        }),
      );
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );

      await expect(
        fixture.service.waitForCompletion(handle),
      ).resolves.toMatchObject({ state: 'generated' });

      expect(fixture.queued.at(-1)).toMatchObject({
        params: { captionContent: '', isMuteVideoAudio: true },
        type: 'add-captions',
      });
    });

    it('mutes inside the merge when there are no captions to transcribe', async () => {
      await fixture.service.stitch(
        request({ settings: { isMuteVideoAudio: true } }),
      );
      expect(fixture.mergeJobs()[0]?.params).toMatchObject({
        isMuteVideoAudio: true,
      });
    });

    it('unlocks the organization first-asset gate when a stitch completes', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );

      await Promise.all([
        fixture.service.waitForCompletion(handle),
        fixture.service.settle(handle),
      ]);

      expect(fixture.eventsNamed('asset-gate')).toEqual([['org-1']]);
      expect(fixture.eventNames().indexOf('asset-gate')).toBeLessThan(
        fixture.eventNames().indexOf('video.complete'),
      );
    });

    it('reports a generated output as generated even if a completion event fails', async () => {
      fixture.isCompletionEventFailing = true;
      const handle = await fixture.service.stitch(request());
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );

      await expect(
        fixture.service.waitForCompletion(handle),
      ).resolves.toMatchObject({
        s3Key: `ingredients/videos/${handle.outputId}`,
        state: 'generated',
      });
      expect(fixture.row(handle.outputId).status).toBe(
        IngredientStatus.GENERATED,
      );
      expect(fixture.eventsNamed('media.failed')).toEqual([]);
    });

    it('runs captions once when two completers settle the same output', async () => {
      const handle = await fixture.service.stitch(
        request({ settings: { isCaptionsEnabled: true } }),
      );
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );

      const outcomes = await Promise.all([
        fixture.service.waitForCompletion(handle),
        fixture.service.settle(handle),
      ]);

      expect(fixture.eventsNamed('whisper')).toHaveLength(1);
      expect(fixture.eventsNamed('caption.create')).toHaveLength(1);
      expect(
        fixture.queued.filter((job) => job.type === 'add-captions'),
      ).toHaveLength(1);
      expect(outcomes[0]?.state).toBe('generated');
      expect(['generated', 'processing']).toContain(outcomes[1]?.state);
      expect(fixture.row(handle.outputId)).toMatchObject({
        generationStage: null,
        status: IngredientStatus.GENERATED,
      });
    });

    it('waits for the caption owner when concurrent workflow callers await completion', async () => {
      const handle = await fixture.service.stitch(
        request({ settings: { isCaptionsEnabled: true } }),
      );
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );

      const outcomes = await Promise.all([
        fixture.service.waitForCompletion(handle),
        fixture.service.waitForCompletion(handle),
      ]);

      expect(outcomes.map((outcome) => outcome.state)).toEqual([
        'generated',
        'generated',
      ]);
      expect(fixture.eventsNamed('whisper')).toHaveLength(1);
    });

    it('does not fail a shared output when a completion waiter times out', async () => {
      const handle = await fixture.service.stitch(request());
      Object.assign(fixture.row(handle.outputId), {
        generationStage: 'stitch-completing',
        updatedAt: new Date(),
      });
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );

      await expect(
        fixture.service.waitForCompletion(handle, 5),
      ).rejects.toThrow('Timed out waiting for video stitch completion');
      expect(fixture.row(handle.outputId).status).toBe(
        IngredientStatus.PROCESSING,
      );
      expect(fixture.eventsNamed('media.failed')).toEqual([]);
    });

    it('lets a later completer take over a stale completion claim', async () => {
      const handle = await fixture.service.stitch(request());
      Object.assign(fixture.row(handle.outputId), {
        generationStage: 'stitch-completing',
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );

      await expect(fixture.service.settle(handle)).resolves.toMatchObject({
        state: 'generated',
      });
    });

    it('marks the output failed with the error and emits the failure events', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.failWaitFor.set(handle.jobId, new Error('ffmpeg exited'));
      fixture.jobStates.set(handle.jobId, JobState.FAILED);

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

    it.each(['Job timeout', 'Queue connection lost'])(
      'preserves a submitted job after an unresolved wait error: %s',
      async (message) => {
        const handle = await fixture.service.stitch(request());
        fixture.failWaitFor.set(handle.jobId, new Error(message));
        await expect(fixture.service.waitForCompletion(handle)).rejects.toThrow(
          message,
        );
        expect(fixture.row(handle.outputId).status).toBe(
          IngredientStatus.PROCESSING,
        );
        expect(fixture.eventsNamed('media.failed')).toEqual([]);
        fixture.failWaitFor.delete(handle.jobId);
        fixture.completeJob(
          handle.jobId,
          `ingredients/videos/${handle.outputId}`,
        );
        await expect(fixture.service.settle(handle)).resolves.toMatchObject({
          state: 'generated',
        });
      },
    );

    it('fails the output when the finished job returned no persisted video', async () => {
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
      expect(fixture.row(handle.outputId)).toMatchObject({
        generationError: 'Video merge did not return a persisted video',
        status: IngredientStatus.FAILED,
      });
      expect(fixture.eventsNamed('media.failed')).toHaveLength(1);
    });

    it('fails a processing output whose job the queue no longer holds', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.dropJob(handle.jobId);

      await expect(fixture.service.settle(handle)).resolves.toMatchObject({
        error: 'Video merge job is no longer queued; retry the merge',
        state: 'failed',
      });
      expect(fixture.row(handle.outputId)).toMatchObject({
        generationError: 'Video merge job is no longer queued; retry the merge',
        status: IngredientStatus.FAILED,
      });
    });

    it('leaves a lost job to the completer that already claimed the output', async () => {
      const handle = await fixture.service.stitch(request());
      Object.assign(fixture.row(handle.outputId), {
        generationStage: 'stitch-completing',
        updatedAt: new Date(),
      });
      fixture.dropJob(handle.jobId);

      await expect(fixture.service.settle(handle)).resolves.toMatchObject({
        state: 'processing',
      });
      expect(fixture.row(handle.outputId).status).toBe(
        IngredientStatus.PROCESSING,
      );
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

  describe('background tracking', () => {
    it('persists a merge that finishes after the waiting caller timeout', async () => {
      const handle = await fixture.service.stitch(request());
      const tracking = fixture.service.trackInBackground(handle, 1_000, 1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );
      await tracking;

      expect(fixture.row(handle.outputId)).toMatchObject({
        s3Key: `ingredients/videos/${handle.outputId}`,
        status: IngredientStatus.GENERATED,
      });
    });

    it('fails the output with the worker error when the merge job fails', async () => {
      const handle = await fixture.service.stitch(
        request({
          settings: {
            transition: VideoTransition.FADE,
            transitionDuration: 0.5,
          },
        }),
      );
      fixture.jobStates.set(handle.jobId, JobState.FAILED);

      await fixture.service.trackInBackground(handle, 1_000, 1);

      expect(fixture.row(handle.outputId)).toMatchObject({
        generationError: 'ffmpeg exited',
        status: IngredientStatus.FAILED,
      });
      expect(fixture.eventsNamed('media.failed')).toHaveLength(1);
    });

    it('fails an output whose job is still unfinished at the deadline', async () => {
      const handle = await fixture.service.stitch(request());

      await fixture.service.trackInBackground(handle, 20, 1);

      expect(fixture.row(handle.outputId)).toMatchObject({
        generationError: 'Video merge did not finish within 1 minutes',
        status: IngredientStatus.FAILED,
      });
    });

    it('rides out unreadable job statuses, then fails with the last error', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.failStatusFor.set(
        handle.jobId,
        new Error('connect ECONNREFUSED files:3012'),
      );

      await fixture.service.trackInBackground(handle, 20, 1);

      expect(fixture.row(handle.outputId)).toMatchObject({
        generationError:
          'Lost track of the video merge: connect ECONNREFUSED files:3012',
        status: IngredientStatus.FAILED,
      });
    });

    it('recovers when the job status becomes readable again', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.failStatusFor.set(handle.jobId, new Error('socket hang up'));
      const tracking = fixture.service.trackInBackground(handle, 1_000, 1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      fixture.failStatusFor.delete(handle.jobId);
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );
      await tracking;

      expect(fixture.row(handle.outputId).status).toBe(
        IngredientStatus.GENERATED,
      );
    });

    it('fails an output whose job the queue lost', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.dropJob(handle.jobId);

      await fixture.service.trackInBackground(handle, 1_000, 1);

      expect(fixture.row(handle.outputId)).toMatchObject({
        generationError: 'Video merge job is no longer queued; retry the merge',
        status: IngredientStatus.FAILED,
      });
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

    it('leaves a processing output whose job is still queued alone', async () => {
      const handle = await fixture.service.stitch(request());
      const retried = await fixture.service.retry(request(), handle);
      expect(retried).toMatchObject({
        jobId: handle.jobId,
        state: 'processing',
      });
      expect(fixture.mergeJobs()).toHaveLength(1);
    });

    it('keeps tracking a legacy job id that the queue still holds', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.knownJobs.add('legacy-job');
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

    it('requeues a processing output whose job the queue lost, under its stitch id', async () => {
      const handle = await fixture.service.stitch(request());
      fixture.dropJob(handle.jobId);

      const retried = await fixture.service.retry(request(), {
        ...handle,
        jobId: 'remix-merge-lost',
      });

      expect(retried).toMatchObject({
        jobId: handle.jobId,
        outputId: handle.outputId,
        state: 'processing',
      });
      expect(fixture.mergeJobs().map((job) => job.id)).toEqual([
        handle.jobId,
        handle.jobId,
      ]);
      fixture.completeJob(
        handle.jobId,
        `ingredients/videos/${handle.outputId}`,
      );
      await expect(fixture.service.settle(retried)).resolves.toMatchObject({
        state: 'generated',
      });
    });
  });
});
