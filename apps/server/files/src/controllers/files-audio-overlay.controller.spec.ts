import { FilesAudioOverlayController } from '@files/controllers/files-audio-overlay.controller';

describe('FilesAudioOverlayController', () => {
  const audioOverlayService = {
    processAudioOverlay: vi.fn(),
  };
  const controller = new FilesAudioOverlayController(
    audioOverlayService as never,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates the request body to the audio overlay service', async () => {
    const body = {
      audioUrl: 'https://cdn.example.com/music.wav',
      audioVolume: 70,
      fadeIn: 1,
      fadeOut: 2,
      mixMode: 'background' as const,
      outputKey: 'custom/audio-overlay.mp4',
      videoUrl: 'https://cdn.example.com/video.mp4',
      videoVolume: 40,
    };
    const expected = {
      audioUrl: body.audioUrl,
      mixMode: body.mixMode,
      outputUrl: 'https://cdn.example.com/custom/audio-overlay.mp4',
      s3Key: body.outputKey,
      success: true as const,
      videoUrl: body.videoUrl,
    };
    audioOverlayService.processAudioOverlay.mockResolvedValueOnce(expected);

    await expect(controller.audioOverlay(body)).resolves.toEqual(expected);
    expect(audioOverlayService.processAudioOverlay).toHaveBeenCalledWith(body);
  });
});
