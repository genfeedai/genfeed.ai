import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { HeyGenController } from '@api/services/integrations/heygen/controllers/heygen.controller';
import { HeyGenAvatarPageDto } from '@api/services/integrations/heygen/dto/heygen-avatar-page.dto';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { HeyGenSpeechVoicesService } from '@api/services/integrations/heygen/services/heygen-speech-voices.service';
import { HeyGenVoiceCatalogService } from '@api/services/integrations/heygen/services/heygen-voice-catalog.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { isAxiosError } from 'axios';
import { validate } from 'class-validator';

const mockUser = {
  id: 'user_abc',
  brandId: testId('brand'),
  organizationId: testId('org'),
  userId: testId('user'),
} as unknown as User;

function providerFailure(options: {
  code?: string;
  message?: string;
  status?: number;
  data?: unknown;
}): Error {
  return Object.assign(new Error(options.message ?? 'Request failed'), {
    code: options.code,
    isAxiosError: true,
    response:
      options.status === undefined
        ? undefined
        : { data: options.data ?? {}, status: options.status },
  });
}

describe('HeyGenController', () => {
  let controller: HeyGenController;
  let heygenService: {
    getConnectionStatus: ReturnType<typeof vi.fn>;
    getAvatars: ReturnType<typeof vi.fn>;
    getAvatarPage: ReturnType<typeof vi.fn>;
    getSpeechVoices: ReturnType<typeof vi.fn>;
  };
  let voiceCatalogService: { getVoices: ReturnType<typeof vi.fn> };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  afterEach(() => {
    vi.mocked(isAxiosError).mockReturnValue(false);
  });

  beforeEach(async () => {
    vi.mocked(isAxiosError).mockImplementation(
      (value: unknown): value is never =>
        (value as { isAxiosError?: boolean } | null)?.isAxiosError === true,
    );
    heygenService = {
      getConnectionStatus: vi
        .fn()
        .mockResolvedValue({ hasCustomKey: true, isConnected: true }),
      getAvatars: vi.fn().mockResolvedValue([]),
      getAvatarPage: vi.fn(),
      getSpeechVoices: vi.fn(),
    };
    voiceCatalogService = { getVoices: vi.fn().mockResolvedValue([]) };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HeyGenController],
      providers: [
        { provide: LoggerService, useValue: loggerService },
        { provide: HeyGenService, useValue: heygenService },
        { provide: HeyGenSpeechVoicesService, useValue: heygenService },
        { provide: HeyGenVoiceCatalogService, useValue: voiceCatalogService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HeyGenController>(HeyGenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return empty voices list when service returns empty array', async () => {
    const result = await controller.getVoices(mockUser);
    expect(result.data.type).toBe('voices');
    expect(result.data.attributes.provider).toBe('heygen');
    expect(result.data.attributes.count).toBe(0);
    expect(result.data.attributes.voices).toEqual([]);
  });

  it('should return mapped voices with correct shape', async () => {
    voiceCatalogService.getVoices.mockResolvedValue([
      {
        index: 0,
        name: 'Alice',
        preview: 'https://example.com/a.mp3',
        voiceId: 'v1',
      },
      { index: 1, name: 'Bob', preview: null, voiceId: 'v2' },
    ]);

    const result = await controller.getVoices(mockUser);
    expect(result.data.attributes.count).toBe(2);
    expect(result.data.attributes.voices).toEqual([
      {
        index: 0,
        name: 'Alice',
        preview: 'https://example.com/a.mp3',
        voiceId: 'v1',
      },
      { index: 1, name: 'Bob', preview: null, voiceId: 'v2' },
    ]);
  });

  it('should pass organization from user metadata to getVoices', async () => {
    await controller.getVoices(mockUser);
    expect(voiceCatalogService.getVoices).toHaveBeenCalledWith(testId('org'));
  });

  it('classifies a provider rejection instead of returning an empty catalog', async () => {
    voiceCatalogService.getVoices.mockRejectedValue(
      providerFailure({ data: { secret: 'provider-payload' }, status: 422 }),
    );
    const error = await controller.getVoices(mockUser).catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(error.getResponse()).toMatchObject({
      code: 'provider_rejected',
      title: 'Failed to fetch HeyGen voices',
    });
    expect(JSON.stringify(error.getResponse())).not.toContain(
      'provider-payload',
    );
  });

  it('reports provider timeouts as a gateway timeout', async () => {
    voiceCatalogService.getVoices.mockRejectedValue(
      providerFailure({
        code: 'ECONNABORTED',
        message: 'timeout of 15000ms exceeded',
      }),
    );
    const error = await controller.getVoices(mockUser).catch((e) => e);
    expect(error.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
    expect(error.getResponse()).toMatchObject({ code: 'provider_timeout' });
  });

  it.each([401, 403])(
    'answers rejected HeyGen credentials (%i) with a 502 and a stable code',
    async (providerStatus) => {
      voiceCatalogService.getVoices.mockRejectedValue(
        providerFailure({ status: providerStatus }),
      );
      const error = await controller.getVoices(mockUser).catch((e) => e);
      expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(error.getResponse()).toMatchObject({
        code: 'HEYGEN_CREDENTIALS_INVALID',
        title: 'Failed to fetch HeyGen voices',
      });
    },
  );

  it('uses the same stable code when avatars hit rejected credentials', async () => {
    heygenService.getAvatars.mockRejectedValue(
      providerFailure({ status: 401 }),
    );
    const error = await controller.getAvatars(mockUser).catch((e) => e);
    expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(error.getResponse()).toMatchObject({
      code: 'HEYGEN_CREDENTIALS_INVALID',
    });
  });

  it('surfaces a not-connected configuration failure as a client error', async () => {
    voiceCatalogService.getVoices.mockRejectedValue(
      new BadRequestException('Connect HeyGen to load identities.'),
    );
    const error = await controller.getVoices(mockUser).catch((e) => e);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.getResponse()).toMatchObject({
      detail: 'Connect HeyGen to load identities.',
    });
  });

  it('logs sanitized diagnostics and hides unexpected fault details', async () => {
    voiceCatalogService.getVoices.mockRejectedValue(
      new Error('sk-secret exploded'),
    );
    const error = await controller.getVoices(mockUser).catch((e) => e);
    expect(error.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(error.getResponse())).not.toContain('sk-secret');
    expect(JSON.stringify(loggerService.error.mock.calls)).not.toContain(
      'sk-secret',
    );
    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      undefined,
      expect.objectContaining({ category: 'provider_unexpected' }),
    );
  });

  it('scopes each voice catalog to the caller organization', async () => {
    const otherOrg = { ...mockUser, organizationId: testId('other-org') };
    voiceCatalogService.getVoices.mockImplementation(async (orgId: string) => [
      { index: 0, name: orgId, preview: '', voiceId: `voice-${orgId}` },
    ]);

    const first = await controller.getVoices(mockUser);
    const second = await controller.getVoices(otherOrg as unknown as User);

    expect(voiceCatalogService.getVoices).toHaveBeenNthCalledWith(
      1,
      testId('org'),
    );
    expect(voiceCatalogService.getVoices).toHaveBeenNthCalledWith(
      2,
      testId('other-org'),
    );
    expect(first.data.attributes.voices[0].voiceId).toBe(
      `voice-${testId('org')}`,
    );
    expect(second.data.attributes.voices[0].voiceId).toBe(
      `voice-${testId('other-org')}`,
    );
  });

  // --- getAvatars ---
  it('should return mapped avatars with correct shape', async () => {
    heygenService.getAvatars.mockResolvedValue([
      { avatarId: 'a1', index: 0, name: 'Avatar1', preview: 'https://img.png' },
    ]);

    const result = await controller.getAvatars(mockUser);
    expect(result.data.type).toBe('avatars');
    expect(result.data.attributes.provider).toBe('heygen');
    expect(result.data.attributes.count).toBe(1);
    expect(result.data.attributes.avatars[0]).toEqual({
      avatarId: 'a1',
      index: 0,
      name: 'Avatar1',
      preview: 'https://img.png',
    });
  });

  it('should throw HttpException when getAvatars fails', async () => {
    heygenService.getAvatars.mockRejectedValue(new Error('timeout'));
    await expect(controller.getAvatars(mockUser)).rejects.toThrow(
      HttpException,
    );
  });

  it('rejects invalid ownership and oversized cursors at the DTO boundary', async () => {
    const invalid = Object.assign(new HeyGenAvatarPageDto(), {
      ownership: 'all',
      cursor: 'x'.repeat(4097),
    });
    expect(
      (await validate(invalid)).map((error) => error.property).sort(),
    ).toEqual(['cursor', 'ownership']);
    const valid = Object.assign(new HeyGenAvatarPageDto(), {
      ownership: 'private',
      cursor: 'opaque/page+2=',
    });
    expect(await validate(valid)).toEqual([]);
  });

  it('serializes a bounded page with its partition and opaque continuation', async () => {
    const page = {
      avatars: [],
      ownership: 'private',
      nextCursor: 'opaque-next',
    };
    heygenService.getAvatarPage.mockResolvedValue(page);
    const result = await controller.getAvatarPage(mockUser, {
      ownership: 'private',
      cursor: 'opaque-current',
    });
    expect(heygenService.getAvatarPage).toHaveBeenCalledWith(
      testId('org'),
      'private',
      'opaque-current',
    );
    expect(result.data.attributes).toEqual({
      ...page,
      provider: 'heygen',
      count: 0,
    });
    expect(result.data.type).toBe('avatars');
  });

  it('preserves page failure rather than reporting an empty complete catalogue', async () => {
    heygenService.getAvatarPage.mockRejectedValue(new Error('provider outage'));
    await expect(controller.getAvatarPage(mockUser, {})).rejects.toThrow(
      HttpException,
    );
  });

  // --- getStatus ---
  it('should return credential-derived connected status', async () => {
    voiceCatalogService.getVoices.mockResolvedValue([]);
    const result = await controller.getStatus(mockUser);
    expect(result.data.type).toBe('service-status');
    expect(result.data.attributes.isConnected).toBe(true);
    expect(result.data.attributes.hasCustomKey).toBe(true);
    expect(result.data.attributes.provider).toBe('heygen');
  });

  it('should throw HttpException when status check fails', async () => {
    heygenService.getConnectionStatus.mockRejectedValue(
      new Error('connection refused'),
    );
    await expect(controller.getStatus(mockUser)).rejects.toThrow(HttpException);
    expect(loggerService.error).toHaveBeenCalled();
  });

  it('should log on every endpoint call', async () => {
    await controller.getVoices(mockUser);
    await controller.getAvatars(mockUser);
    await controller.getStatus(mockUser);
    expect(loggerService.log).toHaveBeenCalledTimes(3);
  });

  it('should handle unknown error message in getVoices', async () => {
    voiceCatalogService.getVoices.mockRejectedValue('string error');
    try {
      await controller.getVoices(mockUser);
    } catch (error) {
      const httpError = error as HttpException;
      const response = httpError.getResponse() as Record<string, string>;
      expect(response.detail).toBe(
        'An unexpected error occurred while loading the provider catalog.',
      );
    }
  });

  describe('getSpeechVoices', () => {
    it('serializes the HeyGen Voice voices for the organization', async () => {
      heygenService.getSpeechVoices.mockResolvedValue({
        hasPersonalConnection: true,
        voices: [
          {
            language: 'en',
            mode: 'instant',
            name: 'My clone',
            ownership: 'private',
            voiceId: 'clone-1',
          },
        ],
      });

      await expect(controller.getSpeechVoices(mockUser)).resolves.toEqual({
        data: {
          attributes: {
            count: 1,
            hasPersonalConnection: true,
            provider: 'heygen',
            voices: [
              {
                language: 'en',
                mode: 'instant',
                name: 'My clone',
                ownership: 'private',
                voiceId: 'clone-1',
              },
            ],
          },
          type: 'speech-voices',
        },
      });
      expect(heygenService.getSpeechVoices).toHaveBeenCalledWith(
        mockUser.organizationId,
      );
    });

    it('surfaces a provider failure as a catalog error', async () => {
      heygenService.getSpeechVoices.mockRejectedValue(
        providerFailure({ status: 503 }),
      );

      await expect(controller.getSpeechVoices(mockUser)).rejects.toBeInstanceOf(
        HttpException,
      );
    });
  });
});
