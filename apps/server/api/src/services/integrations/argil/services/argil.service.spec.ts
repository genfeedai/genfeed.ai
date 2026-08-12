import { ArgilService } from '@api/services/integrations/argil/services/argil.service';
import { ArgilWebhookTokenService } from '@api/services/integrations/argil/services/argil-webhook-token.service';
import { ByokProvider } from '@genfeedai/enums';
import { of } from 'rxjs';

describe('ArgilService', () => {
  const byokService = { resolveApiKey: vi.fn() };
  const configService = { get: vi.fn() };
  const httpService = { get: vi.fn(), post: vi.fn() };
  const loggerService = { log: vi.fn() };
  const webhookTokenService = { create: vi.fn() };
  let service: ArgilService;

  beforeEach(() => {
    vi.clearAllMocks();
    byokService.resolveApiKey.mockResolvedValue({ apiKey: 'org-key' });
    configService.get.mockImplementation((key: string) =>
      key === 'GENFEEDAI_WEBHOOKS_URL'
        ? 'https://hooks.example.com'
        : undefined,
    );
    webhookTokenService.create.mockReturnValue('signed-token');
    service = new ArgilService(
      byokService as never,
      configService as never,
      httpService as never,
      loggerService as never,
      webhookTokenService as unknown as ArgilWebhookTokenService,
    );
  });

  it('creates an Atom video and starts rendering with a signed callback URL', async () => {
    const onVideoCreated = vi.fn(async () => {
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });
    httpService.post
      .mockReturnValueOnce(of({ data: { id: 'video-1' } }))
      .mockReturnValueOnce(of({ data: {} }));

    await expect(
      service.generateAvatarVideo({
        avatarId: 'avatar-1',
        callbackId: 'clip-1',
        onVideoCreated,
        organizationId: 'org-1',
        script: 'Hello from Genfeed',
        voiceId: 'voice-1',
      }),
    ).resolves.toBe('video-1');

    expect(onVideoCreated).toHaveBeenCalledWith('video-1');

    expect(byokService.resolveApiKey).toHaveBeenCalledWith(
      'org-1',
      ByokProvider.ARGIL,
    );
    expect(httpService.post).toHaveBeenNthCalledWith(
      1,
      'https://api.argil.ai/v1/videos',
      {
        aspectRatio: '9:16',
        extras: { callbackId: 'clip-1' },
        model: 'ARGIL_ATOM',
        moments: [
          {
            avatarId: 'avatar-1',
            transcript: 'Hello from Genfeed',
            voiceId: 'voice-1',
          },
        ],
        name: 'Genfeed clip clip-1',
      },
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'org-key' }),
      }),
    );
    expect(httpService.post).toHaveBeenNthCalledWith(
      2,
      'https://api.argil.ai/v1/videos/video-1/render',
      {
        callbackUrl:
          'https://hooks.example.com/v1/webhooks/argil/callback?token=signed-token',
      },
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'org-key' }),
      }),
    );
  });

  it('fails before render when webhook verification is unavailable', async () => {
    byokService.resolveApiKey.mockResolvedValue(undefined);
    configService.get.mockImplementation((key: string) =>
      key === 'ARGIL_KEY' ? 'env-key' : undefined,
    );
    webhookTokenService.create.mockReturnValue(undefined);
    httpService.post.mockReturnValueOnce(of({ data: { videoId: 'video-2' } }));

    await expect(
      service.generateAvatarVideo({
        avatarId: 'avatar-2',
        callbackId: 'clip-2',
        organizationId: 'org-2',
        script: 'Script',
        voiceId: 'voice-2',
      }),
    ).rejects.toThrow('requires an HTTPS webhook URL');

    expect(httpService.post).toHaveBeenCalledTimes(1);
    expect(httpService.post).toHaveBeenCalledWith(
      'https://api.argil.ai/v1/videos',
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'env-key' }),
      }),
    );
  });

  it('rejects an HTTP callback URL because Argil requires HTTPS', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'GENFEEDAI_WEBHOOKS_URL'
        ? 'http://tunnel.example.com'
        : undefined,
    );
    httpService.post.mockReturnValueOnce(of({ data: { id: 'video-http' } }));

    await expect(
      service.generateAvatarVideo({
        avatarId: 'avatar-http',
        callbackId: 'clip-http',
        organizationId: 'org-http',
        script: 'Script',
        voiceId: 'voice-http',
      }),
    ).rejects.toThrow('requires an HTTPS webhook URL');

    expect(httpService.post).toHaveBeenCalledTimes(1);
  });

  it('normalizes completed video status', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          id: 'video-3',
          status: 'DONE',
          videoUrl: 'https://cdn.argil.ai/video-3.mp4',
        },
      }),
    );

    await expect(service.getVideoStatus('video-3', 'org-3')).resolves.toEqual({
      error: undefined,
      id: 'video-3',
      status: 'DONE',
      videoUrl: 'https://cdn.argil.ai/video-3.mp4',
    });
  });

  it('normalizes Argil catalog responses', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          avatars: [
            {
              id: 'avatar-1',
              name: 'Presenter',
              thumbnailUrl: 'https://cdn.argil.ai/avatar.png',
            },
          ],
        },
      }),
    );

    await expect(service.getAvatars('org-1')).resolves.toEqual([
      {
        id: 'avatar-1',
        name: 'Presenter',
        previewUrl: 'https://cdn.argil.ai/avatar.png',
      },
    ]);
  });
});
