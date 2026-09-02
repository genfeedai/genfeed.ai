import { ManagedInferenceProvider } from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import { GenfeedaiAvatarProvider } from '@api/services/avatar-video/providers/genfeedai-avatar.provider';

describe('GenfeedaiAvatarProvider', () => {
  const managedInferenceClient = { generateVideo: vi.fn() };
  const configService = { get: vi.fn() };
  const logger = { error: vi.fn() };
  let provider: GenfeedaiAvatarProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'GENFEED_API_KEY') return 'gf_live_managed';
      if (key === 'GENFEED_MANAGED_INFERENCE_URL') {
        return 'https://api.genfeed.ai/v1/managed-inference';
      }
      return undefined;
    });
    managedInferenceClient.generateVideo.mockResolvedValue(
      'https://cdn.genfeed.ai/clips/clip-1.mp4',
    );
    provider = new GenfeedaiAvatarProvider(
      managedInferenceClient as never,
      configService as never,
      logger as never,
    );
  });

  it('dispatches an explicit managed GenfeedAI image-to-video request', async () => {
    const onJobCreated = vi.fn();
    await expect(
      provider.generateVideo({
        avatarId: '',
        callbackId: 'clip-1',
        organizationId: 'org-1',
        onJobCreated,
        referenceImageUrl: 'https://cdn.example.com/character.png',
        script: 'A concise vertical clip script.',
        userId: 'user-1',
        voiceId: '',
      }),
    ).resolves.toEqual({
      jobId: 'genfeedai-clip-clip-1',
      providerName: 'genfeedai',
      status: 'completed',
      videoUrl: 'https://cdn.genfeed.ai/clips/clip-1.mp4',
    });

    expect(onJobCreated).toHaveBeenCalledWith({
      jobId: 'genfeedai-clip-clip-1',
      providerName: 'genfeedai',
    });
    expect(managedInferenceClient.generateVideo).toHaveBeenCalledWith({
      apiKey: 'gf_live_managed',
      endpointUrl: 'https://api.genfeed.ai/v1/managed-inference',
      input: {
        aspectRatio: '9:16',
        height: 1920,
        imageUrl: 'https://cdn.example.com/character.png',
        prompt: 'A concise vertical clip script.',
        width: 1080,
      },
      model: 'genfeedai/clip-video',
      provider: ManagedInferenceProvider.GENFEEDAI,
    });
  });

  it('fails closed when managed access is not enabled', async () => {
    configService.get.mockReturnValue(undefined);

    const result = await provider.generateVideo({
      avatarId: '',
      callbackId: 'clip-1',
      organizationId: 'org-1',
      referenceImageUrl: 'https://cdn.example.com/character.png',
      script: 'Script',
      userId: 'user-1',
      voiceId: '',
    });

    expect(result).toEqual(
      expect.objectContaining({
        providerName: 'genfeedai',
        status: 'failed',
      }),
    );
    expect(managedInferenceClient.generateVideo).not.toHaveBeenCalled();
  });

  it('requires a character reference before dispatch', async () => {
    const result = await provider.generateVideo({
      avatarId: '',
      callbackId: 'clip-1',
      organizationId: 'org-1',
      script: 'Script',
      userId: 'user-1',
      voiceId: '',
    });

    expect(result.error).toContain('reference image');
    expect(result.status).toBe('failed');
    expect(managedInferenceClient.generateVideo).not.toHaveBeenCalled();
  });

  it('rejects a non-URL managed response instead of persisting it as media', async () => {
    managedInferenceClient.generateVideo.mockResolvedValue('remote-job-1');

    const result = await provider.generateVideo({
      avatarId: '',
      callbackId: 'clip-1',
      organizationId: 'org-1',
      referenceImageUrl: 'https://cdn.example.com/character.png',
      script: 'Script',
      userId: 'user-1',
      voiceId: '',
    });

    expect(result.status).toBe('failed');
  });
});
