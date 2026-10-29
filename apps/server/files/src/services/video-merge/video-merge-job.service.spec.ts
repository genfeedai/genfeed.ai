import { mkdir, rm, writeFile } from 'node:fs/promises';
import { VideoMergeJobService } from '@files/services/video-merge/video-merge-job.service';
import type { VideoJobData } from '@files/shared/interfaces/job.interface';
import { VideoTransition } from '@genfeedai/contracts';
import {
  FILE_JOB_TYPES as JOB_TYPES,
  type FileJobType as JobType,
} from '@genfeedai/contracts/queue';
import type { Job } from 'bullmq';
import sharp from 'sharp';

const createJobData = (
  overrides: Partial<VideoJobData> = {},
): VideoJobData => ({
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  id: 'merge-job-123',
  ingredientId: 'ingredient-123',
  metadata: { websocketUrl: '/ws/videos' },
  organizationId: 'organization-123',
  params: { sourceIds: ['source-1', 'source-2'] },
  type: JOB_TYPES.MERGE_VIDEOS as JobType,
  userId: 'user-123',
  ...overrides,
});

const createJob = (data: VideoJobData): Job<VideoJobData> =>
  ({
    data,
    id: 'job-123',
    name: JOB_TYPES.MERGE_VIDEOS,
  }) as unknown as Job<VideoJobData>;

const probeResult = (duration: string) => ({
  format: { duration, size: '100' },
  streams: [{ codec_type: 'video', width: 64, height: 64 }],
});

describe('VideoMergeJobService', () => {
  const ffmpegService = {
    applyColorLut: vi.fn().mockResolvedValue(undefined),
    appendEndCard: vi.fn().mockResolvedValue(undefined),
    cleanupTempFiles: vi.fn(),
    probe: vi.fn(),
    convertToPortrait: vi.fn().mockResolvedValue(undefined),
    getTempPath: vi.fn(
      (type: string, ingredientId: string) => `/tmp/${type}-${ingredientId}`,
    ),
    mergeVideos: vi.fn().mockResolvedValue(undefined),
    trimVideoToDuration: vi.fn().mockResolvedValue(undefined),
    mergeVideosWithMusic: vi.fn().mockResolvedValue(undefined),
    mergeVideosWithTransitions: vi.fn().mockResolvedValue(undefined),
  };
  const s3Service = {
    downloadFile: vi.fn().mockResolvedValue(undefined),
    downloadFromUrl: vi.fn().mockResolvedValue(undefined),
    getPresignedDownloadUrlForStoredKey: vi
      .fn()
      .mockImplementation(
        async (key: string) =>
          `https://s3.example/${encodeURIComponent(key)}?Signature=fresh`,
      ),
    generateS3Key: vi.fn((folder: string, id: string) => `${folder}/${id}.mp4`),
    getPublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
    uploadFile: vi.fn().mockResolvedValue(undefined),
  };
  const webSocketService = {
    emitError: vi.fn(),
    emitProgress: vi.fn(),
    emitSuccess: vi.fn(),
  };
  const redisService = {
    publish: vi.fn().mockResolvedValue(1),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const beatDetectionService = { analyzeBeat: vi.fn() };
  let service: VideoMergeJobService;

  beforeEach(() => {
    vi.clearAllMocks();
    ffmpegService.probe.mockReset();
    ffmpegService.probe.mockResolvedValue(probeResult('6'));
    service = new VideoMergeJobService(
      ffmpegService as never,
      s3Service as never,
      webSocketService as never,
      redisService as never,
      logger as never,
      undefined,
      beatDetectionService as never,
    );
  });

  const activatedService = () =>
    new VideoMergeJobService(
      ffmpegService as never,
      s3Service as never,
      webSocketService as never,
      redisService as never,
      logger as never,
      { isAuthorizedMediaDeliveryEnabled: true } as never,
    );

  it('uses supplied canonical source and music keys and returns the actual random output object when activated', async () => {
    s3Service.uploadFile.mockResolvedValueOnce({
      Key: 'ingredients/videos/actual-merged-object',
    });
    const result = await activatedService().process(
      createJob(
        createJobData({
          params: {
            sourceIds: ['source-1'],
            sourceStorageKeys: ['ingredients/videos/random-source'],
            music: 'music-1',
            musicStorageKey: 'ingredients/musics/random-track',
          },
        }),
      ),
    );
    expect(s3Service.getPresignedDownloadUrlForStoredKey).toHaveBeenCalledWith(
      'ingredients/videos/random-source',
      300,
    );
    expect(s3Service.getPresignedDownloadUrlForStoredKey).toHaveBeenCalledWith(
      'ingredients/musics/random-track',
      300,
    );
    expect(s3Service.generateS3Key).toHaveBeenCalledTimes(1);
    expect(s3Service.generateS3Key).toHaveBeenCalledWith(
      'videos',
      expect.stringMatching(/^[a-f0-9-]{36}$/),
    );
    expect(result.s3Key).toBe('ingredients/videos/actual-merged-object');
  });

  describe('beat sync', () => {
    const steadyBeat = {
      beatTimestamps: Array.from(
        { length: 80 },
        (_, index) => 0.5 * index + 0.5,
      ),
      confidence: 0.9,
      downbeats: Array.from({ length: 20 }, (_, index) => 2 * index + 0.5),
      tempo: 120,
    };
    const beatSyncParams = {
      isBeatSyncEnabled: true,
      music: 'music-123',
      sourceIds: ['source-1', 'source-2'],
    };

    beforeEach(() => {
      ffmpegService.probe.mockResolvedValue(probeResult('6.2'));
    });

    it('trims each clip so the cuts land on the beat and reports the edit as synced', async () => {
      beatDetectionService.analyzeBeat.mockResolvedValueOnce(steadyBeat);

      const result = await service.process(
        createJob(createJobData({ params: beatSyncParams })),
      );

      expect(beatDetectionService.analyzeBeat).toHaveBeenCalledWith(
        '/tmp/merge-ingredient-123/music.mp3',
      );
      // 6.2 s clips on a 0.5 s grid: cuts at 6.0 s and 12.0 s.
      expect(ffmpegService.trimVideoToDuration).toHaveBeenCalledTimes(2);
      for (const call of ffmpegService.trimVideoToDuration.mock.calls) {
        expect(call[2]).toBeCloseTo(6, 3);
      }
      expect(ffmpegService.mergeVideosWithMusic).toHaveBeenCalledWith(
        [
          '/tmp/merge-ingredient-123/beat_0.mp4',
          '/tmp/merge-ingredient-123/beat_1.mp4',
        ],
        expect.any(String),
        expect.objectContaining({
          musicPath: '/tmp/merge-ingredient-123/music.mp3',
        }),
        expect.any(Function),
      );
      expect(ffmpegService.cleanupTempFiles.mock.calls.flat()).toEqual(
        expect.arrayContaining([
          '/tmp/merge-ingredient-123/beat_0.mp4',
          '/tmp/merge-ingredient-123/beat_1.mp4',
        ]),
      );
      expect(result.isBeatSynced).toBe(true);
    });

    it('leaves a clip alone when it already ends on a beat', async () => {
      ffmpegService.probe.mockResolvedValue(probeResult('6'));
      beatDetectionService.analyzeBeat.mockResolvedValueOnce(steadyBeat);

      await service.process(
        createJob(createJobData({ params: beatSyncParams })),
      );

      expect(ffmpegService.trimVideoToDuration).not.toHaveBeenCalled();
    });

    it('joins the clips as they are when the music has no steady beat', async () => {
      beatDetectionService.analyzeBeat.mockResolvedValueOnce({
        ...steadyBeat,
        confidence: 0.1,
      });

      const result = await service.process(
        createJob(createJobData({ params: beatSyncParams })),
      );

      expect(ffmpegService.trimVideoToDuration).not.toHaveBeenCalled();
      expect(result.isBeatSynced).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('joins the clips as they are when the beat analysis fails', async () => {
      beatDetectionService.analyzeBeat.mockRejectedValueOnce(
        new Error('ffmpeg exited with code 1'),
      );

      const result = await service.process(
        createJob(createJobData({ params: beatSyncParams })),
      );

      expect(ffmpegService.trimVideoToDuration).not.toHaveBeenCalled();
      expect(result.isBeatSynced).toBe(false);
    });

    it('does not analyze anything unless the job asks for beat sync', async () => {
      const result = await service.process(
        createJob(
          createJobData({
            params: { music: 'music-123', sourceIds: ['source-1', 'source-2'] },
          }),
        ),
      );

      expect(beatDetectionService.analyzeBeat).not.toHaveBeenCalled();
      expect(result.isBeatSynced).toBe(false);
    });

    it('does not analyze anything when there is no music to cut to', async () => {
      const result = await service.process(
        createJob(
          createJobData({
            params: {
              isBeatSyncEnabled: true,
              sourceIds: ['source-1', 'source-2'],
            },
          }),
        ),
      );

      expect(beatDetectionService.analyzeBeat).not.toHaveBeenCalled();
      expect(result.isBeatSynced).toBe(false);
    });
  });

  describe('brand end card', () => {
    const tempDirectory = '/tmp/merge-ingredient-123';
    const endCardParams = {
      endCardBackgroundColor: '#112233',
      endCardDuration: 3,
      endCardStorageKey: 'logos/brand-logo',
      sourceIds: ['source-1'],
      sourceStorageKeys: ['ingredients/videos/source-1'],
    };

    beforeEach(async () => {
      await mkdir(tempDirectory, { recursive: true });
      // A transparent logo, as brand kits store them.
      const logo = await sharp({
        create: {
          background: { alpha: 0, b: 0, g: 0, r: 0 },
          channels: 4,
          height: 20,
          width: 40,
        },
      })
        .png()
        .toBuffer();
      s3Service.downloadFile.mockImplementation(
        async (key: string, localPath: string) => {
          if (key === 'logos/brand-logo') {
            await writeFile(localPath, logo);
          }
        },
      );
    });

    afterEach(async () => {
      s3Service.downloadFile.mockReset().mockResolvedValue(undefined);
      await rm(tempDirectory, { force: true, recursive: true });
    });

    it('fits the card to the video frame and delivers the joined file', async () => {
      await service.process(
        createJob(createJobData({ params: endCardParams })),
      );

      expect(ffmpegService.appendEndCard).toHaveBeenCalledWith(
        `${tempDirectory}/merged.mp4`,
        `${tempDirectory}/end-card.png`,
        `${tempDirectory}/with-end-card.mp4`,
        { durationSeconds: 3 },
        expect.any(Function),
      );
      // The 40x20 transparent logo became an opaque card at the video's size.
      const card = await sharp(`${tempDirectory}/end-card.png`).metadata();
      expect(card).toMatchObject({ hasAlpha: false, height: 64, width: 64 });
      const { data } = await sharp(`${tempDirectory}/end-card.png`)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([...data.subarray(0, 3)]).toEqual([0x11, 0x22, 0x33]);
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        `${tempDirectory}/with-end-card.mp4`,
        'video/mp4',
      );
    });

    it('adds no card when the brand has none', async () => {
      await service.process(createJob(createJobData()));
      expect(ffmpegService.appendEndCard).not.toHaveBeenCalled();
    });

    it('fails the job instead of delivering a video without the card', async () => {
      ffmpegService.appendEndCard.mockRejectedValueOnce(new Error('ffmpeg'));
      await expect(
        service.process(createJob(createJobData({ params: endCardParams }))),
      ).rejects.toThrow('ffmpeg');
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
      expect(webSocketService.emitError).toHaveBeenCalled();
    });

    it.each(['red', '#12', '#112233; drawtext', undefined])(
      'refuses a card background of %s',
      async (endCardBackgroundColor) => {
        await expect(
          service.process(
            createJob(
              createJobData({
                params: { ...endCardParams, endCardBackgroundColor },
              }),
            ),
          ),
        ).rejects.toThrow('background color');
        expect(ffmpegService.appendEndCard).not.toHaveBeenCalled();
      },
    );
  });

  describe('brand colour LUT', () => {
    const tempDirectory = '/tmp/merge-ingredient-123';
    const lutParams = {
      endCardBackgroundColor: '#112233',
      endCardDuration: 3,
      endCardStorageKey: 'logos/brand-logo',
      lutStorageKey: 'brand-luts/org-1/brand-1/lut.cube',
      sourceIds: ['source-1'],
      sourceStorageKeys: ['ingredients/videos/source-1'],
    };

    beforeEach(async () => {
      await mkdir(tempDirectory, { recursive: true });
      const logo = await sharp({
        create: {
          background: { alpha: 1, b: 0, g: 0, r: 0 },
          channels: 4,
          height: 20,
          width: 40,
        },
      })
        .png()
        .toBuffer();
      s3Service.downloadFile.mockImplementation(
        async (key: string, localPath: string) => {
          if (key === 'logos/brand-logo') await writeFile(localPath, logo);
        },
      );
    });

    afterEach(async () => {
      s3Service.downloadFile.mockReset().mockResolvedValue(undefined);
      await rm(tempDirectory, { force: true, recursive: true });
    });

    it('grades the merged video, then closes the graded file with the end card', async () => {
      await service.process(createJob(createJobData({ params: lutParams })));

      expect(s3Service.downloadFile).toHaveBeenCalledWith(
        'brand-luts/org-1/brand-1/lut.cube',
        `${tempDirectory}/brand-lut.cube`,
      );
      expect(ffmpegService.applyColorLut).toHaveBeenCalledWith(
        `${tempDirectory}/merged.mp4`,
        `${tempDirectory}/brand-lut.cube`,
        `${tempDirectory}/graded.mp4`,
        expect.any(Function),
      );
      expect(ffmpegService.appendEndCard).toHaveBeenCalledWith(
        `${tempDirectory}/graded.mp4`,
        expect.any(String),
        expect.any(String),
        expect.anything(),
        expect.any(Function),
      );
    });

    it('delivers the graded file when there is no end card', async () => {
      await service.process(
        createJob(
          createJobData({
            params: {
              lutStorageKey: lutParams.lutStorageKey,
              sourceIds: ['source-1'],
              sourceStorageKeys: ['ingredients/videos/source-1'],
            },
          }),
        ),
      );

      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        `${tempDirectory}/graded.mp4`,
        'video/mp4',
      );
    });

    it('grades nothing when the brand has no LUT', async () => {
      await service.process(createJob(createJobData()));
      expect(ffmpegService.applyColorLut).not.toHaveBeenCalled();
    });

    it('fails the job instead of delivering an ungraded video', async () => {
      ffmpegService.applyColorLut.mockRejectedValueOnce(new Error('lut3d'));
      await expect(
        service.process(createJob(createJobData({ params: lutParams }))),
      ).rejects.toThrow('lut3d');
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
      expect(webSocketService.emitError).toHaveBeenCalled();
    });
  });

  it('fails before downloading when activated source keys are absent', async () => {
    await expect(
      activatedService().process(createJob(createJobData())),
    ).rejects.toThrow('canonical source storage keys');
    expect(s3Service.downloadFile).not.toHaveBeenCalled();
    expect(s3Service.uploadFile).not.toHaveBeenCalled();
  });

  it('fails instead of reconstructing a selected music object from its ID when activated', async () => {
    await expect(
      activatedService().process(
        createJob(
          createJobData({
            params: {
              sourceIds: ['source-1'],
              sourceStorageKeys: ['ingredients/videos/random-source'],
              music: 'music-1',
            },
          }),
        ),
      ),
    ).rejects.toThrow('canonical music storage key');
    expect(s3Service.generateS3Key).not.toHaveBeenCalled();
    expect(s3Service.uploadFile).not.toHaveBeenCalled();
  });

  it('preserves the standard merge completion contract', async () => {
    const data = createJobData();

    const result = await service.process(createJob(data));

    expect(s3Service.downloadFile).toHaveBeenCalledTimes(2);
    expect(ffmpegService.mergeVideos).toHaveBeenCalledWith(
      expect.arrayContaining([
        '/tmp/merge-ingredient-123/input_0.mp4',
        '/tmp/merge-ingredient-123/input_1.mp4',
      ]),
      '/tmp/merge-ingredient-123/merged.mp4',
      undefined,
      expect.any(Function),
    );
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      'videos/ingredient-123.mp4',
      '/tmp/merge-ingredient-123/merged.mp4',
      'video/mp4',
    );
    expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
      '/tmp/merge-ingredient-123/input_0.mp4',
      '/tmp/merge-ingredient-123/input_1.mp4',
    );
    expect(webSocketService.emitSuccess).toHaveBeenCalledWith(
      data.metadata.websocketUrl,
      {
        ingredientId: data.ingredientId,
        s3Key: 'videos/ingredient-123.mp4',
        url: 'https://cdn.example.com/videos/ingredient-123.mp4',
      },
      data.userId,
      data.room,
    );
    expect(redisService.publish).toHaveBeenCalledWith(
      'background-task-update',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(result).toEqual({
      outputPath: '/tmp/merge-ingredient-123/merged.mp4',
      duration: 6,
      size: 100,
      width: 64,
      height: 64,
      url: 'https://cdn.example.com/videos/ingredient-123.mp4',
      s3Key: 'videos/ingredient-123.mp4',
      success: true,
      isBeatSynced: false,
    });
  });

  it('downloads ordered persisted keys instead of guessing extensions', async () => {
    const result = await service.process(
      createJob(
        createJobData({
          params: {
            sourceIds: ['source-1', 'source-2'],
            isPersistedOutputOnly: true,
            sourceStorageKeys: [
              'ingredients/videos/source-1.mp4',
              'ingredients/videos/nested/source-2.webm',
            ],
          },
        }),
      ),
    );
    expect(s3Service.downloadFile.mock.calls.map((call) => call[0])).toEqual([
      'ingredients/videos/source-1.mp4',
      'ingredients/videos/nested/source-2.webm',
    ]);
    expect(result.outputPath).toBeUndefined();
    expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
      '/tmp/merge-ingredient-123/input_0.mp4',
      '/tmp/merge-ingredient-123/input_1.mp4',
      '/tmp/merge-ingredient-123/merged.mp4',
    );
  });
  it.each(['ingredients/videos/../secret', 'ingredients/audios/secret.wav'])(
    'rejects unsafe source key %s before download',
    async (key) => {
      await expect(
        service.process(
          createJob(
            createJobData({
              params: {
                sourceIds: ['source-1', 'source-2'],
                sourceStorageKeys: [key, 'ingredients/videos/ok.mp4'],
              },
            }),
          ),
        ),
      ).rejects.toThrow();
      expect(s3Service.downloadFile).not.toHaveBeenCalled();
    },
  );

  it('preserves music, progress, and resize orchestration', async () => {
    const data = createJobData({
      params: {
        height: 1920,
        isMuteVideoAudio: true,
        isResizeEnabled: true,
        music: 'music-123',
        musicVolume: 0.1,
        sourceIds: ['source-1', 'source-2'],
        width: 1080,
      },
    });
    ffmpegService.mergeVideosWithMusic.mockImplementationOnce(
      async (_inputs, _output, _options, onProgress) => {
        onProgress?.({ percent: 50 });
      },
    );

    const result = await service.process(createJob(data));

    expect(s3Service.downloadFile).toHaveBeenCalledTimes(3);
    expect(ffmpegService.mergeVideosWithMusic).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(String),
      {
        musicPath: '/tmp/merge-ingredient-123/music.mp3',
        musicVolume: 0.1,
        muteVideoAudio: true,
      },
      expect.any(Function),
    );
    expect(ffmpegService.convertToPortrait).toHaveBeenCalledWith(
      '/tmp/merge-ingredient-123/merged.mp4',
      '/tmp/merge-ingredient-123/resized.mp4',
      { height: 1920, width: 1080 },
      expect.any(Function),
    );
    expect(webSocketService.emitProgress).toHaveBeenCalledWith(
      data.metadata.websocketUrl,
      expect.objectContaining({
        currentStepLabel: 'Merging videos with music',
        percent: 62.5,
        step: 'merging',
        stepProgress: 50,
      }),
      data.userId,
      data.room,
    );
    expect(result.outputPath).toBe('/tmp/merge-ingredient-123/resized.mp4');
    expect(result.url).toBe(
      'https://cdn.example.com/videos/ingredient-123.mp4',
    );
  });

  it('falls back to transition-free merge when music download fails', async () => {
    const data = createJobData({
      params: {
        music: 'music-123',
        sourceIds: ['source-1'],
        transition: VideoTransition.NONE,
      },
    });
    s3Service.downloadFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Music not found'));

    await service.process(createJob(data));

    expect(ffmpegService.mergeVideos).toHaveBeenCalled();
    expect(ffmpegService.mergeVideosWithMusic).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to download music file: Music not found',
    );
  });

  it('mutes clip audio in a plain merge without music', async () => {
    const data = createJobData();
    data.params.isMuteVideoAudio = true;

    await service.process(createJob(data));

    expect(ffmpegService.mergeVideos).toHaveBeenCalledWith(
      expect.any(Array),
      '/tmp/merge-ingredient-123/merged.mp4',
      { muteVideoAudio: true },
      expect.any(Function),
    );
  });

  it('mutes clip audio in a transition merge without music', async () => {
    const data = createJobData();
    data.params.isMuteVideoAudio = true;
    data.params.transition = VideoTransition.FADE;
    data.params.transitionDuration = 0.5;

    await service.process(createJob(data));

    expect(ffmpegService.mergeVideosWithTransitions).toHaveBeenCalledWith(
      expect.any(Array),
      '/tmp/merge-ingredient-123/merged.mp4',
      expect.objectContaining({ muteVideoAudio: true, transition: 'fade' }),
      expect.any(Function),
    );
  });

  it('preserves failure notification and propagation', async () => {
    const data = createJobData();
    ffmpegService.mergeVideos.mockRejectedValueOnce(new Error('Merge failed'));

    await expect(service.process(createJob(data))).rejects.toThrow(
      'Merge failed',
    );

    expect(webSocketService.emitError).toHaveBeenCalledWith(
      data.metadata.websocketUrl,
      'Merge failed',
      data.userId,
      data.room,
    );
    expect(redisService.publish).toHaveBeenCalledWith(
      'background-task-update',
      expect.objectContaining({ error: 'Merge failed', status: 'failed' }),
    );
  });

  it('signs exact whitespace and reserved-character video and music keys before bounded downloads', async () => {
    const videoKey = 'ingredients/videos/clip %2F?#.mp4';
    const musicKey = 'ingredients/musics/track %2F?#.wav';
    s3Service.uploadFile.mockResolvedValueOnce({
      Key: 'ingredients/videos/random-output.mp4',
    });
    await activatedService().process(
      createJob(
        createJobData({
          params: {
            sourceIds: ['source-1'],
            sourceStorageKeys: [videoKey],
            music: 'music-1',
            musicStorageKey: musicKey,
          },
        }),
      ),
    );
    expect(s3Service.getPresignedDownloadUrlForStoredKey.mock.calls).toEqual([
      [videoKey, 300],
      [musicKey, 300],
    ]);
    expect(
      s3Service.downloadFromUrl.mock.calls.map((call) => [call[0], call[2]]),
    ).toEqual([
      [
        `https://s3.example/${encodeURIComponent(videoKey)}?Signature=fresh`,
        1024 * 1024 * 1024,
      ],
      [
        `https://s3.example/${encodeURIComponent(musicKey)}?Signature=fresh`,
        1024 * 1024 * 1024,
      ],
    ]);
    expect(s3Service.downloadFile).not.toHaveBeenCalled();
  });

  it.each([
    'ingredients/videos/../secret',
    'ingredients/audios/foreign.wav',
    'ingredients/videos/bad\\key.mp4',
  ])(
    'rejects invalid active canonical source %s before signing or fetching',
    async (key) => {
      await expect(
        activatedService().process(
          createJob(
            createJobData({
              params: { sourceIds: ['source-1'], sourceStorageKeys: [key] },
            }),
          ),
        ),
      ).rejects.toThrow();
      expect(
        s3Service.getPresignedDownloadUrlForStoredKey,
      ).not.toHaveBeenCalled();
      expect(s3Service.downloadFromUrl).not.toHaveBeenCalled();
    },
  );
});
