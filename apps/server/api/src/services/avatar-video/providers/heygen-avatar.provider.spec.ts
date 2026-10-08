import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

import { HeygenAvatarProvider } from './heygen-avatar.provider';

describe('HeygenAvatarProvider', () => {
  let provider: HeygenAvatarProvider;
  let byokService: {
    resolveApiKey: ReturnType<typeof vi.fn>;
    lookupApiKeyWithIdentity: ReturnType<typeof vi.fn>;
  };
  let apiKeyHelperService: { getApiKey: ReturnType<typeof vi.fn> };
  let httpService: { get: ReturnType<typeof vi.fn> };
  let heygenService: {
    generateNativeAvatarVideo: ReturnType<typeof vi.fn>;
    resolveOrganizationConnection: ReturnType<typeof vi.fn>;
    resolveAvatarSelection: ReturnType<typeof vi.fn>;
    validateVoiceSelection: ReturnType<typeof vi.fn>;
    getAvatars: ReturnType<typeof vi.fn>;
    generatePhotoAvatarVideo: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const connection = {
    apiKey: 'byok-xyz',
    binding: {
      provider: 'heygen' as const,
      kind: 'byok' as const,
      organizationId: 'org-1',
      credentialVersionId: 'original',
    },
  };
  const avatarRef = {
    version: 1 as const,
    source: 'heygen-look' as const,
    provider: 'heygen' as const,
    lookId: 'avatar-1',
    groupId: null,
    ownership: 'private' as const,
    label: 'Saved',
    preview: 'https://cdn/preview.jpg',
    avatarType: 'digital_twin',
    supportedEngines: ['avatar_iv'],
    readiness: {
      usable: true,
      lookStatus: 'completed',
      groupStatus: null,
      consentStatus: null,
      reason: null,
    },
    connection: connection.binding,
  };
  const prisma = {
    ingredient: { findFirst: vi.fn() },
    clipResult: { updateMany: vi.fn(), findFirst: vi.fn() },
  };

  beforeEach(async () => {
    prisma.ingredient.findFirst.mockResolvedValue(null);
    prisma.clipResult.findFirst.mockResolvedValue(null);
    prisma.clipResult.updateMany.mockResolvedValue({ count: 1 });
    byokService = { resolveApiKey: vi.fn(), lookupApiKeyWithIdentity: vi.fn() };
    apiKeyHelperService = { getApiKey: vi.fn() };
    httpService = { get: vi.fn() };
    heygenService = {
      generateNativeAvatarVideo: vi.fn().mockResolvedValue('avatar-job-1'),
      resolveOrganizationConnection: vi.fn().mockResolvedValue(connection),
      resolveAvatarSelection: vi
        .fn()
        .mockResolvedValue({ avatarRef, connection }),
      validateVoiceSelection: vi.fn().mockResolvedValue({ voiceId: 'voice-1' }),
      getAvatars: vi
        .fn()
        .mockResolvedValue([{ avatarId: 'avatar-1', avatarRef }]),
      generatePhotoAvatarVideo: vi.fn().mockResolvedValue('photo-job-1'),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HeygenAvatarProvider,
        { provide: PrismaService, useValue: prisma },
        { provide: HeyGenService, useValue: heygenService },
        { provide: ByokService, useValue: byokService },
        { provide: HttpService, useValue: httpService },
        { provide: LoggerService, useValue: loggerService },
        { provide: ApiKeyHelperService, useValue: apiKeyHelperService },
      ],
    }).compile();

    provider = module.get<HeygenAvatarProvider>(HeygenAvatarProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes providerName as heygen', () => {
    expect(provider.providerName).toBe('heygen');
  });

  describe('generateVideo', () => {
    const input = {
      avatarId: 'avatar-1',
      callbackId: 'clip-result-1',
      organizationId: 'org-1',
      script: 'Create this clip',
      userId: 'user-1',
      voiceId: 'voice-1',
    };

    it('freezes the clip receipt before dispatching its native look', async () => {
      await provider.generateVideo(input);
      expect(prisma.clipResult.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'clip-result-1',
          organizationId: 'org-1',
          isDeleted: false,
        },
        data: {
          generationProvider: expect.objectContaining({
            connection: connection.binding,
            avatar: avatarRef,
          }),
        },
      });
      expect(
        prisma.clipResult.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        heygenService.generateNativeAvatarVideo.mock.invocationCallOrder[0],
      );
      expect(heygenService.generateNativeAvatarVideo).toHaveBeenCalledWith(
        'clip-result-1',
        'avatar-1',
        { voiceId: 'voice-1', inputText: 'Create this clip' },
        'byok-xyz',
      );
      expect(heygenService.generatePhotoAvatarVideo).not.toHaveBeenCalled();
    });

    it('keeps an authorized image on the image route', async () => {
      const result = await provider.generateVideo({
        ...input,
        referenceImageUrl: 'https://cdn.example.com/reference.jpg',
      });
      expect(heygenService.generatePhotoAvatarVideo).toHaveBeenCalledWith(
        'clip-result-1',
        'https://cdn.example.com/reference.jpg',
        { voiceId: 'voice-1', inputText: 'Create this clip' },
        'org-1',
        'user-1',
        'byok-xyz',
      );
      expect(heygenService.generateNativeAvatarVideo).not.toHaveBeenCalled();
      expect(result.status).toBe('processing');
    });

    it('does not submit without a durable provenance receipt', async () => {
      prisma.clipResult.updateMany.mockResolvedValueOnce({ count: 0 });
      expect((await provider.generateVideo(input)).status).toBe('failed');
      expect(heygenService.generateNativeAvatarVideo).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('calls HeyGen status endpoint with BYOK key when present', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'byok-xyz' });
      httpService.get.mockReturnValue(
        of({
          data: {
            data: { status: 'completed', video_url: 'https://hg/video.mp4' },
          },
        }),
      );

      const result = await provider.getStatus('video-1', 'org-1');

      expect(byokService.resolveApiKey).toHaveBeenCalledWith('org-1', 'heygen');
      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.heygen.com/v3/videos/video-1',
        expect.objectContaining({
          headers: { 'X-Api-Key': 'byok-xyz' },
        }),
      );
      expect(result).toEqual({
        jobId: 'video-1',
        providerName: 'heygen',
        status: 'completed',
        videoUrl: 'https://hg/video.mp4',
      });
    });

    it('falls back to env HEYGEN_KEY when BYOK returns undefined', async () => {
      byokService.resolveApiKey.mockResolvedValue(undefined);
      apiKeyHelperService.getApiKey.mockReturnValue('env-key-abc');
      httpService.get.mockReturnValue(
        of({ data: { data: { status: 'processing' } } }),
      );

      const result = await provider.getStatus('video-2', 'org-2');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'X-Api-Key': 'env-key-abc' },
        }),
      );
      expect(result.status).toBe('processing');
    });

    it('returns unknown status when no API key is resolvable', async () => {
      byokService.resolveApiKey.mockResolvedValue(undefined);
      apiKeyHelperService.getApiKey.mockReturnValue('');

      const result = await provider.getStatus('video-3', 'org-3');

      expect(httpService.get).not.toHaveBeenCalled();
      expect(result.status).toBe('unknown');
      expect(result.error).toContain('No HeyGen API key configured');
    });

    it('returns unknown status when the request throws', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'valid' });
      httpService.get.mockReturnValue(throwError(() => new Error('timeout')));

      const result = await provider.getStatus('video-5', 'org-5');

      expect(result.status).toBe('unknown');
    });

    it.each([
      ['a malformed body', { data: 'oops' }],
      ['missing data', { data: { data: null } }],
    ])('returns unknown status for %s', async (_name, body) => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'valid' });
      httpService.get.mockReturnValue(of(body));

      const result = await provider.getStatus('video-6', 'org-6');

      expect(result.status).toBe('unknown');
    });

    it('returns failed status only when HeyGen reports failure', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'valid' });
      httpService.get.mockReturnValue(
        of({
          data: { data: { status: 'failed', failure_message: 'bad avatar' } },
        }),
      );

      const result = await provider.getStatus('video-7', 'org-7');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('bad avatar');
    });

    it('never ships an empty api key in headers (regression guard)', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'valid' });
      httpService.get.mockReturnValue(
        of({ data: { data: { status: 'processing' } } }),
      );

      await provider.getStatus('video-4', 'org-4');

      const callArgs = httpService.get.mock.calls[0];
      const config = callArgs[1] as { headers: Record<string, string> };
      expect(config.headers['X-Api-Key']).not.toBe('');
      expect(config.headers['X-Api-Key']).toBeTruthy();
    });
  });
  it('does not poll a new account after the submitting key changes', async () => {
    const receipt = {
      version: 1,
      provider: 'heygen',
      organizationId: 'org-1',
      connection: connection.binding,
      avatar: avatarRef,
      speech: { provider: 'heygen', externalVoiceId: 'voice-1' },
      submissionId: 'clip-result-1',
    };
    prisma.clipResult.findFirst.mockResolvedValueOnce({
      generationProvider: receipt,
    });
    byokService.lookupApiKeyWithIdentity.mockResolvedValue({
      apiKey: 'new-account-key',
      credentialId: 'changed',
    });
    const result = await provider.getStatus('job', 'org-1');
    expect(result.status).toBe('unknown');
    expect(result.error).toContain('Restore');
    expect(httpService.get).not.toHaveBeenCalled();
    expect(byokService.resolveApiKey).not.toHaveBeenCalled();
    expect(apiKeyHelperService.getApiKey).not.toHaveBeenCalled();
  });

  it('polls frozen provenance only with the original matching credential', async () => {
    prisma.ingredient.findFirst.mockResolvedValueOnce({
      generationProvider: {
        version: 1,
        provider: 'heygen',
        organizationId: 'org-1',
        connection: connection.binding,
        avatar: avatarRef,
        speech: { provider: 'heygen' },
        submissionId: 'ingredient',
      },
    });
    byokService.lookupApiKeyWithIdentity.mockResolvedValue({
      apiKey: 'original-key',
      credentialId: 'original',
    });
    httpService.get.mockReturnValue(
      of({ data: { data: { status: 'processing' } } }),
    );
    expect((await provider.getStatus('job', 'org-1')).status).toBe(
      'processing',
    );
    expect(httpService.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { 'X-Api-Key': 'original-key' } }),
    );
  });
});
