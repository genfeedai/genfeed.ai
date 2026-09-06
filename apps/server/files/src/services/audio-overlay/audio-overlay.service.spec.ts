import { AudioOverlayService } from '@files/services/audio-overlay/audio-overlay.service';

const mocks = vi.hoisted(() => ({ download: vi.fn(), unlink: vi.fn() }));
vi.mock('@files/services/audio-overlay/media-download', () => ({
  downloadPublicMedia: mocks.download,
}));
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  existsSync: () => true,
  unlinkSync: mocks.unlink,
}));

describe('AudioOverlayService', () => {
  const ffmpeg = {
    getTempPath: () => '/tmp/overlay',
    overlayAudio: vi.fn(),
    probe: vi.fn(),
  };
  const upload = { uploadToS3: vi.fn() };
  const service = new AudioOverlayService(
    ffmpeg as never,
    { log: vi.fn(), error: vi.fn(), warn: vi.fn() } as never,
    upload as never,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.download.mockResolvedValue(Buffer.from('media'));
    ffmpeg.overlayAudio.mockResolvedValue(undefined);
    ffmpeg.probe.mockResolvedValue({ format: { duration: '30' } });
    upload.uploadToS3.mockResolvedValue({
      publicUrl: 'https://cdn.example.com/result.mp4',
    });
  });
  it('returns the client public URL and duration while keeping legacy outputUrl', async () => {
    const result = await service.processAudioOverlay({
      videoUrl: 'https://cdn.example.com/video.mp4',
      audioUrl: 'https://cdn.example.com/speech.wav',
      mixMode: 'replace',
    });
    expect(result).toMatchObject({
      publicUrl: 'https://cdn.example.com/result.mp4',
      outputUrl: 'https://cdn.example.com/result.mp4',
      duration: 30,
    });
    expect(mocks.download).toHaveBeenCalledWith(
      'https://cdn.example.com/video.mp4',
      500 * 1024 * 1024,
      undefined,
    );
    expect(mocks.unlink).toHaveBeenCalledTimes(3);
  });
  it('cleans temporary downloads after an encoding failure', async () => {
    ffmpeg.overlayAudio.mockRejectedValueOnce(new Error('encoder failed'));
    await expect(
      service.processAudioOverlay({
        videoUrl: 'https://cdn.example.com/video.mp4',
        audioUrl: 'https://cdn.example.com/speech.wav',
      }),
    ).rejects.toThrow('encoder failed');
    expect(upload.uploadToS3).not.toHaveBeenCalled();
    expect(mocks.unlink).toHaveBeenCalledTimes(3);
  });
  it('rejects invalid mode before downloading', async () => {
    await expect(
      service.processAudioOverlay({
        videoUrl: 'https://cdn.example.com/video.mp4',
        audioUrl: 'https://cdn.example.com/speech.wav',
        mixMode: 'invalid' as never,
      }),
    ).rejects.toThrow('Invalid mixMode');
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
