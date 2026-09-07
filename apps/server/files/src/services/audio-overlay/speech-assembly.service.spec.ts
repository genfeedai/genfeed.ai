import { SpeechAssemblyService } from '@files/services/audio-overlay/speech-assembly.service';

const mocks = vi.hoisted(() => ({ download: vi.fn(), rm: vi.fn() }));
vi.mock('@files/services/audio-overlay/media-download', () => ({
  downloadPublicMedia: mocks.download,
}));
vi.mock('node:fs/promises', () => ({
  mkdtemp: async () => '/tmp/speech-test',
  writeFile: vi.fn(),
  rm: mocks.rm,
}));

describe('SpeechAssemblyService', () => {
  const ffmpeg = {
    getTempPath: () => '/tmp',
    probe: vi.fn(),
    executeFFmpegCapture: vi.fn(),
  };
  const upload = { uploadToS3: vi.fn() };
  const service = new SpeechAssemblyService(ffmpeg as never, upload as never);
  const segment = {
    audioUrl: 'https://cdn.example.com/speech.wav',
    startSeconds: 3,
    endSeconds: 6,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.download.mockResolvedValue(Buffer.from('audio'));
    ffmpeg.probe.mockResolvedValue({
      format: { duration: '2' },
      streams: [{ codec_type: 'audio' }],
    });
    ffmpeg.executeFFmpegCapture.mockResolvedValue({ code: 0 });
    upload.uploadToS3.mockResolvedValue({
      publicUrl: 'https://cdn.example.com/assembled.wav',
    });
  });
  it('keeps the delayed onset and pads the full requested timeline', async () => {
    const result = await service.assemble({
      segments: [segment],
      durationSeconds: 30,
    });
    expect(result.duration).toBe(30);
    const args = ffmpeg.executeFFmpegCapture.mock.calls[0][0] as string[];
    expect(args[args.indexOf('-filter_complex') + 1]).toContain(
      'adelay=3000:all=1',
    );
    expect(args[args.indexOf('-filter_complex') + 1]).toContain(
      'apad,atrim=duration=30',
    );
  });
  it('reports speech overruns instead of truncating spoken words', async () => {
    ffmpeg.probe.mockResolvedValue({
      format: { duration: '4' },
      streams: [{ codec_type: 'audio' }],
    });
    await expect(
      service.assemble({ segments: [segment], durationSeconds: 30 }),
    ).rejects.toThrow('exceeds its time window');
    expect(ffmpeg.executeFFmpegCapture).not.toHaveBeenCalled();
    expect(upload.uploadToS3).not.toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalled();
  });
  it('rejects overlapping segments before downloading', async () => {
    await expect(
      service.assemble({
        segments: [segment, { ...segment, startSeconds: 5, endSeconds: 7 }],
        durationSeconds: 30,
      }),
    ).rejects.toThrow('non-overlapping');
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
