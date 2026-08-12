import { ArgilAvatarProvider } from '@api/services/avatar-video/providers/argil-avatar.provider';
import type { GenerateArgilVideoInput } from '@api/services/integrations/argil/services/argil.service';

describe('ArgilAvatarProvider', () => {
  const argilService = {
    generateAvatarVideo: vi.fn(),
    getVideoStatus: vi.fn(),
  };
  const loggerService = { error: vi.fn() };
  let provider: ArgilAvatarProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ArgilAvatarProvider(
      argilService as never,
      loggerService as never,
    );
  });

  it('dispatches an Argil avatar job', async () => {
    const onJobCreated = vi.fn();
    argilService.generateAvatarVideo.mockImplementation(
      async (input: GenerateArgilVideoInput) => {
        await input.onVideoCreated?.('video-1');
        return 'video-1';
      },
    );
    await expect(
      provider.generateVideo({
        avatarId: 'avatar-1',
        callbackId: 'clip-1',
        organizationId: 'org-1',
        onJobCreated,
        script: 'Script',
        userId: 'user-1',
        voiceId: 'voice-1',
      }),
    ).resolves.toEqual({
      jobId: 'video-1',
      providerName: 'argil',
      status: 'processing',
    });
    expect(onJobCreated).toHaveBeenCalledWith({
      jobId: 'video-1',
      providerName: 'argil',
    });
  });

  it('maps a completed Argil status', async () => {
    argilService.getVideoStatus.mockResolvedValue({
      id: 'video-1',
      status: 'DONE',
      videoUrl: 'https://cdn.argil.ai/video.mp4',
    });
    await expect(provider.getStatus('video-1', 'org-1')).resolves.toEqual({
      jobId: 'video-1',
      providerName: 'argil',
      status: 'completed',
      videoUrl: 'https://cdn.argil.ai/video.mp4',
    });
  });

  it('rejects reference-image jobs unsupported by Atom', async () => {
    const result = await provider.generateVideo({
      avatarId: 'avatar-1',
      callbackId: 'clip-1',
      organizationId: 'org-1',
      referenceImageUrl: 'https://example.com/reference.png',
      script: 'Script',
      userId: 'user-1',
      voiceId: 'voice-1',
    });
    expect(result.status).toBe('failed');
    expect(argilService.generateAvatarVideo).not.toHaveBeenCalled();
  });

  it('rejects missing Argil identity input before dispatch', async () => {
    const result = await provider.generateVideo({
      avatarId: '',
      callbackId: 'clip-1',
      organizationId: 'org-1',
      script: 'Script',
      userId: 'user-1',
      voiceId: 'voice-1',
    });
    expect(result.status).toBe('failed');
    expect(argilService.generateAvatarVideo).not.toHaveBeenCalled();
  });

  it('fails closed when Argil reports DONE without a video URL', async () => {
    argilService.getVideoStatus.mockResolvedValue({
      id: 'video-1',
      status: 'DONE',
    });
    await expect(provider.getStatus('video-1', 'org-1')).resolves.toEqual({
      error: 'Argil completed without a video URL',
      jobId: 'video-1',
      providerName: 'argil',
      status: 'failed',
    });
  });
});
