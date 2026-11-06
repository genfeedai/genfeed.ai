import { ManagedInferenceProvider } from '@api/endpoints/v1/managed-inference/dto/managed-inference-request.dto';
import type { ManagedInferenceClientService } from '@api/endpoints/v1/managed-inference/managed-inference-client.service';
import { GenfeedaiAvatarProvider } from '@api/services/avatar-video/providers/genfeedai-avatar.provider';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

const MANAGED_CONFIG: Record<string, string> = {
  GENFEED_API_KEY: 'gf_live_managed',
  GENFEED_MANAGED_INFERENCE_URL: 'https://api.genfeed.ai/v1/managed-inference',
};

type JobAnnouncement = { jobId: string; providerName: string };

describe('GenfeedaiAvatarProvider', () => {
  // Requests the managed inference endpoint received, and what it answers.
  let submissions: Record<string, unknown>[];
  let managedResponse: string;
  let config: Record<string, string>;
  let provider: GenfeedaiAvatarProvider;

  beforeEach(() => {
    submissions = [];
    managedResponse = 'https://cdn.genfeed.ai/clipper/clip-1.mp4';
    config = { ...MANAGED_CONFIG };
    const managedInferenceClient = {
      generateVideo: async (request: Record<string, unknown>) => {
        submissions.push(request);
        return managedResponse;
      },
    };
    const configService = { get: (key: string) => config[key] };
    const logger = { error: () => undefined };
    provider = new GenfeedaiAvatarProvider(
      managedInferenceClient as unknown as ManagedInferenceClientService,
      configService as unknown as ConfigService,
      logger as unknown as LoggerService,
    );
  });

  it('dispatches an explicit managed GenfeedAI image-to-video request', async () => {
    const announced: JobAnnouncement[] = [];
    await expect(
      provider.generateVideo({
        avatarId: '',
        callbackId: 'clip-1',
        organizationId: 'org-1',
        onJobCreated: async (job: JobAnnouncement) => {
          announced.push(job);
        },
        referenceImageUrl: 'https://cdn.example.com/character.png',
        script: 'A concise vertical clip script.',
        userId: 'user-1',
        voiceId: '',
      }),
    ).resolves.toEqual({
      jobId: 'genfeedai-clip-clip-1',
      providerName: 'genfeedai',
      status: 'completed',
      videoUrl: 'https://cdn.genfeed.ai/clipper/clip-1.mp4',
    });

    expect(announced).toEqual([
      { jobId: 'genfeedai-clip-clip-1', providerName: 'genfeedai' },
    ]);
    expect(submissions).toEqual([
      {
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
      },
    ]);
  });

  it('fails closed when managed access is not enabled', async () => {
    config = {};

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
    expect(submissions).toEqual([]);
  });

  it('refuses unfunded platform clips before announcing or submitting a provider job', async () => {
    const fundingRequests: unknown[] = [];
    const announced: JobAnnouncement[] = [];
    const result = await provider.generateVideo({
      avatarId: '',
      callbackId: 'clip-1',
      fundSubmission: async (request: unknown) => {
        fundingRequests.push(request);
        throw new Error('Clip pricing unavailable');
      },
      onJobCreated: async (job: JobAnnouncement) => {
        announced.push(job);
      },
      organizationId: 'org-1',
      referenceImageUrl: 'https://cdn.example.com/character.png',
      script: 'Script',
      userId: 'user-1',
      voiceId: '',
    });
    expect(result.status).toBe('failed');
    expect(fundingRequests).toEqual([
      { isByok: false, selection: { modelKey: 'genfeedai/clip-video' } },
    ]);
    expect(announced).toEqual([]);
    expect(submissions).toEqual([]);
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
    expect(submissions).toEqual([]);
  });

  it('rejects a non-URL managed response instead of persisting it as media', async () => {
    managedResponse = 'remote-job-1';

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
