import { ClipReferenceFrameExtractionService } from '@files/services/clip-reference-frames/clip-reference-frame-extraction.service';

describe('ClipReferenceFrameExtractionService', () => {
  const ffmpegService = {
    cleanupTempFiles: vi.fn().mockResolvedValue(undefined),
    extractFrame: vi.fn().mockResolvedValue('/tmp/frame.jpg'),
    getTempPath: vi.fn().mockReturnValue('/tmp/reference-frames'),
  };
  const uploadService = {
    uploadToS3: vi.fn().mockResolvedValue({
      height: 720,
      publicUrl: 'https://cdn.test/reference.jpg',
      width: 1280,
    }),
  };
  const ytDlpService = {
    downloadVideo: vi.fn().mockResolvedValue('/tmp/reference-frames/source.mp4'),
  };
  const logger = {
    warn: vi.fn(),
  };

  let service: ClipReferenceFrameExtractionService;

  beforeEach(() => {
    vi.clearAllMocks();
    ffmpegService.extractFrame.mockResolvedValue('/tmp/frame.jpg');
    uploadService.uploadToS3.mockResolvedValue({
      height: 720,
      publicUrl: 'https://cdn.test/reference.jpg',
      width: 1280,
    });
    ytDlpService.downloadVideo.mockResolvedValue(
      '/tmp/reference-frames/source.mp4',
    );
    service = new ClipReferenceFrameExtractionService(
      ffmpegService as never,
      uploadService as never,
      ytDlpService as never,
      logger as never,
    );
  });

  it('downloads once and uploads at most five deterministic candidates', async () => {
    const result = await service.extract({
      organizationId: 'org-123',
      projectId: 'project-123',
      sourceUrl: 'https://www.youtube.com/watch?v=test',
      timestamps: [30, 10, 20, 40, 50, 60, 10],
    });

    expect(result.status).toBe('ready');
    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.map((candidate) => candidate.timestampSeconds)).toEqual(
      [10, 20, 30, 40, 50],
    );
    expect(result.candidates[0]).toMatchObject({
      height: 720,
      id: 'frame-1-10000',
      mimeType: 'image/jpeg',
      status: 'available',
      storageKey:
        'ingredients/images/organizations/org-123/clips/project-123/reference-frames/frame-1-10000.jpg',
      width: 1280,
    });
    expect(ytDlpService.downloadVideo).toHaveBeenCalledOnce();
    expect(ffmpegService.extractFrame).toHaveBeenCalledTimes(5);
    expect(uploadService.uploadToS3).toHaveBeenCalledTimes(5);
    expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
      '/tmp/reference-frames/source.mp4',
      '/tmp/reference-frames/frame-1.jpg',
      '/tmp/reference-frames/frame-2.jpg',
      '/tmp/reference-frames/frame-3.jpg',
      '/tmp/reference-frames/frame-4.jpg',
      '/tmp/reference-frames/frame-5.jpg',
    );
  });

  it('returns a partial contract when one candidate fails', async () => {
    ffmpegService.extractFrame
      .mockResolvedValueOnce('/tmp/frame-1.jpg')
      .mockRejectedValueOnce(new Error('ffmpeg failed'));

    const result = await service.extract({
      organizationId: 'org-123',
      projectId: 'project-123',
      sourceUrl: 'https://youtu.be/test',
      timestamps: [5, 15],
    });

    expect(result.status).toBe('partial');
    expect(result.candidates).toEqual([
      expect.objectContaining({ id: 'frame-1-5000', status: 'available' }),
      expect.objectContaining({
        assetId: 'frame-2-15000',
        id: 'frame-2-15000',
        status: 'failed',
      }),
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'clip_reference_candidates_incomplete',
        severity: 'warning',
      }),
    ]);
  });

  it('rejects non-YouTube sources without downloading them', async () => {
    const result = await service.extract({
      organizationId: 'org-123',
      projectId: 'project-123',
      sourceUrl: 'https://example.com/video.mp4',
      timestamps: [5],
    });

    expect(result).toMatchObject({
      candidates: [],
      status: 'unavailable',
    });
    expect(result.diagnostics[0]?.code).toBe(
      'clip_reference_invalid_source',
    );
    expect(ytDlpService.downloadVideo).not.toHaveBeenCalled();
  });

  it('returns unavailable and cleans up when the source download fails', async () => {
    ytDlpService.downloadVideo.mockRejectedValueOnce(
      new Error('source unavailable'),
    );

    const result = await service.extract({
      organizationId: 'org-123',
      projectId: 'project-123',
      sourceUrl: 'https://www.youtube.com/watch?v=test',
      timestamps: [5],
    });

    expect(result.status).toBe('unavailable');
    expect(result.diagnostics[0]?.code).toBe(
      'clip_reference_download_failed',
    );
    expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
      '/tmp/reference-frames/source.mp4',
      '/tmp/reference-frames/frame-1.jpg',
    );
  });
});
