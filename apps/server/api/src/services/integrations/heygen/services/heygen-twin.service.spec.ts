import { Readable } from 'node:stream';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { HeyGenTwinService } from '@api/services/integrations/heygen/services/heygen-twin.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { type AxiosResponse, isAxiosError } from 'axios';
import { of, throwError } from 'rxjs';

// Shapes follow developers.heygen.com/docs/avatar-from-video.md, /avatar-consent.md
// and /direct-upload.md (read 2026-11-08).

const ORG = 'org-a';
const GROUP = {
  consent_status: 'pending',
  id: 'grp_1',
  status: 'pending_consent',
};
const LOOK = {
  group_id: 'grp_1',
  id: 'look_1',
  status: 'processing',
  supported_api_engines: ['avatar_iv', 'avatar_v'],
};

function ok(data: unknown, status = 200): AxiosResponse {
  return { config: {} as never, data, headers: {}, status, statusText: 'OK' };
}

function failure(status: number, data: unknown, headers = {}) {
  return throwError(() => ({
    isAxiosError: true,
    message: 'failed',
    response: { data, headers, status },
  }));
}

describe('HeyGenTwinService', () => {
  let service: HeyGenTwinService;
  const http = {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  };
  const heyGen = {
    resolveOrganizationConnection: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(isAxiosError).mockImplementation(
      (value: unknown): value is never =>
        (value as { isAxiosError?: boolean } | null)?.isAxiosError === true,
    );
    heyGen.resolveOrganizationConnection.mockResolvedValue({
      apiKey: 'personal-key',
    });
    const module = await Test.createTestingModule({
      providers: [
        HeyGenTwinService,
        { provide: HeyGenService, useValue: heyGen },
        { provide: HttpService, useValue: http },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
      ],
    }).compile();
    service = module.get(HeyGenTwinService);
  });

  describe('uploadFootage', () => {
    const input = {
      contentType: 'video/webm',
      filename: 'take.webm',
      sizeBytes: 5_000_000,
      sourceUrl: 'https://cdn.example.com/take.webm',
    };

    it('uploads through a direct-upload slot and returns the asset id', async () => {
      http.post
        .mockReturnValueOnce(
          of(
            ok({
              data: {
                asset_id: 'asset_9',
                upload_headers: { 'Content-Type': 'video/webm' },
                upload_url: 'https://s3.example.com/slot',
              },
            }),
          ),
        )
        .mockReturnValueOnce(
          of(ok({ data: { asset_id: 'asset_9', status: 'processing' } })),
        );
      http.get.mockReturnValue(of(ok(Readable.from(['x']))));
      http.put.mockReturnValue(of(ok('')));

      await expect(service.uploadFootage(ORG, input)).resolves.toEqual({
        assetId: 'asset_9',
      });
      expect(http.put.mock.calls[0]?.[0]).toBe('https://s3.example.com/slot');
    });

    it('refuses a non-video file before calling the provider', async () => {
      await expect(
        service.uploadFootage(ORG, { ...input, contentType: 'audio/mpeg' }),
      ).rejects.toThrow('mp4, webm or mov');
      expect(http.post).not.toHaveBeenCalled();
    });

    it('refuses footage over the 200 MB direct-upload cap', async () => {
      await expect(
        service.uploadFootage(ORG, { ...input, sizeBytes: 201 * 1024 * 1024 }),
      ).rejects.toThrow('200 MB');
    });

    it('refuses a source that is not https', async () => {
      await expect(
        service.uploadFootage(ORG, { ...input, sourceUrl: 'http://x/y.webm' }),
      ).rejects.toThrow('https');
    });
  });

  describe('createTwin', () => {
    it('returns the new group and look in their starting state', async () => {
      http.post.mockReturnValue(
        of(ok({ data: { avatar_group: GROUP, avatar_item: LOOK } })),
      );
      const created = await service.createTwin(ORG, {
        assetId: 'asset_9',
        name: 'My Digital Twin',
      });
      expect(created.look).toMatchObject({
        groupId: 'grp_1',
        lookId: 'look_1',
        status: 'processing',
        supportedEngines: ['avatar_iv', 'avatar_v'],
      });
      expect(created.group).toMatchObject({
        consentStatus: 'pending',
        groupId: 'grp_1',
        status: 'pending_consent',
      });
    });

    it('uses only the workspace connection, never the platform key', async () => {
      http.post.mockReturnValue(
        of(ok({ data: { avatar_group: GROUP, avatar_item: LOOK } })),
      );
      await service.createTwin(ORG, { assetId: 'a', name: 'n' });
      expect(heyGen.resolveOrganizationConnection).toHaveBeenCalledWith(
        ORG,
        'byok',
      );
    });

    it('fails with the reconnect message when no personal key exists', async () => {
      heyGen.resolveOrganizationConnection.mockRejectedValue(
        new Error(
          'Reconnect your personal HeyGen account to use this identity.',
        ),
      );
      await expect(
        service.createTwin(ORG, { assetId: 'a', name: 'n' }),
      ).rejects.toThrow('Reconnect your personal HeyGen account');
    });
  });

  describe('reading state', () => {
    it('reports a failed look with the provider reason', async () => {
      http.get.mockReturnValue(
        of(
          ok({
            data: {
              error: {
                code: 'moderation_failed',
                message: 'Face not visible.',
              },
              id: 'look_1',
              status: 'failed',
            },
          }),
        ),
      );
      await expect(service.getLook(ORG, 'look_1')).resolves.toMatchObject({
        errorCode: 'moderation_failed',
        errorMessage: 'Face not visible.',
        status: 'failed',
      });
    });

    it('reads accepted consent from the group', async () => {
      http.get.mockReturnValue(
        of(
          ok({
            data: {
              consent_status: 'accepted',
              default_voice_id: 'voice_1',
              id: 'grp_1',
              status: 'completed',
            },
          }),
        ),
      );
      await expect(service.getGroup(ORG, 'grp_1')).resolves.toMatchObject({
        consentStatus: 'accepted',
        defaultVoiceId: 'voice_1',
        status: 'completed',
      });
    });

    it('treats an unknown status as still processing, never as ready', async () => {
      http.get.mockReturnValue(
        of(ok({ data: { id: 'look_1', status: 'something_new' } })),
      );
      await expect(service.getLook(ORG, 'look_1')).resolves.toMatchObject({
        status: 'processing',
      });
    });
  });

  describe('consent', () => {
    it('returns the consent page and a 24 hour expiry', async () => {
      http.post.mockReturnValue(
        of(
          ok({
            data: {
              avatar_group: GROUP,
              url: 'https://app.heygen.com/consent/abc',
            },
          }),
        ),
      );
      const before = Date.now();
      const link = await service.requestConsentLink(ORG, 'grp_1', {
        rerouteUrl: 'https://app.genfeed.ai/library/avatars',
      });
      expect(link.consentUrl).toBe('https://app.heygen.com/consent/abc');
      expect(link.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
        24 * 60 * 60 * 1000,
      );
    });

    it('fails when the provider returns no link', async () => {
      http.post.mockReturnValue(of(ok({ data: { avatar_group: GROUP } })));
      await expect(service.requestConsentLink(ORG, 'grp_1')).rejects.toThrow(
        'no consent link',
      );
    });

    it('returns the group after a consent video is submitted', async () => {
      http.post.mockReturnValue(of(ok({ data: { avatar_group: GROUP } })));
      await expect(
        service.submitConsentVideo(ORG, 'grp_1', { assetId: 'asset_c' }),
      ).resolves.toMatchObject({ consentStatus: 'pending', groupId: 'grp_1' });
    });
  });

  describe('deleteTwin', () => {
    it('removes the group, recordings and voices and counts already-gone ones as deleted', async () => {
      http.delete
        .mockReturnValueOnce(of(ok({})))
        .mockReturnValueOnce(failure(404, { error: { code: 'not_found' } }))
        .mockReturnValueOnce(failure(500, {}));
      const result = await service.deleteTwin(ORG, {
        assetIds: ['asset_1'],
        groupId: 'grp_1',
        voiceIds: ['voice_1'],
      });
      expect(result.deleted).toEqual(['avatar:grp_1', 'asset:asset_1']);
      expect(result.failed).toEqual([
        { reason: 'HeyGen is unavailable.', resource: 'voice:voice_1' },
      ]);
    });
  });

  describe('provider failures', () => {
    it.each([
      [400, { error: { message: 'Bad file.' } }, 'Bad file.'],
      [401, {}, 'Reconnect your personal HeyGen account'],
      [402, {}, 'insufficient credit'],
      [409, { error: { code: 'request_in_progress' } }, 'still handling'],
      [500, {}, 'unavailable'],
    ])('maps status %i to a readable error', async (status, body, text) => {
      http.post.mockReturnValue(failure(status, body));
      await expect(
        service.createTwin(ORG, { assetId: 'a', name: 'n' }),
      ).rejects.toThrow(text);
    });

    it('tells the caller when to retry after a rate limit', async () => {
      http.post.mockReturnValue(failure(429, {}, { 'retry-after': '12' }));
      await expect(
        service.createTwin(ORG, { assetId: 'a', name: 'n' }),
      ).rejects.toThrow('Retry after 12 seconds');
    });
  });
});
