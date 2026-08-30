import { AvatarsController } from '@api/collections/avatars/controllers/avatars.controller';
import type { AvatarsService } from '@api/collections/avatars/services/avatars.service';
import { IngredientCategory } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import type { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
import type { HedraService } from '@server/services/integrations/hedra/services/hedra.service';
import type { HeyGenService } from '@server/services/integrations/heygen/services/heygen.service';
import type { Request } from 'express';

const userId = testId('user');
const orgId = testId('org');
const brandId = testId('brand');

const makeUser = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: 'authProvider-user-1',
    brandId: brandId,
    isSuperAdmin: false,
    organizationId: orgId,
    userId: userId,
    ...overrides,
  }) as unknown as User;

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

const mockHeygenService = {
  getAvatars: vi.fn(),
  getVoices: vi.fn(),
} as unknown as HeyGenService;

const mockHedraService = {
  getAvatars: vi.fn(),
  getVoices: vi.fn(),
} as unknown as HedraService;

const mockElevenlabsService = {
  getVoices: vi.fn(),
} as unknown as ElevenLabsService;

const mockAvatarsService = {
  findAll: vi.fn(),
  findOne: vi.fn(),
} as unknown as AvatarsService;

function buildController() {
  return new AvatarsController(
    mockLoggerService,
    mockHeygenService,
    mockHedraService,
    mockElevenlabsService,
    mockAvatarsService,
  );
}

describe('AvatarsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(buildController()).toBeDefined();
  });

  describe('getHeygenVoices', () => {
    it('should return HeyGen voices wrapped in JSON:API', async () => {
      const controller = buildController();
      const mockVoices = [{ name: 'Test Voice', voice_id: 'v1' }];
      vi.mocked(mockHeygenService.getVoices).mockResolvedValue(
        mockVoices as never,
      );

      const result = await controller.getHeygenVoices(makeUser());
      expect(result).toMatchObject({
        data: {
          attributes: { provider: 'heygen', voices: mockVoices },
          id: 'heygen',
          type: 'voice-provider',
        },
      });
    });

    it('should throw HttpException on failure', async () => {
      const controller = buildController();
      vi.mocked(mockHeygenService.getVoices).mockRejectedValue(
        new Error('API down'),
      );

      await expect(controller.getHeygenVoices(makeUser())).rejects.toThrow();
    });
  });

  describe('getHeygenAvatars', () => {
    it('should return HeyGen avatars wrapped in JSON:API', async () => {
      const controller = buildController();
      const mockAvatars = [{ avatar_id: 'a1', avatar_name: 'Test' }];
      vi.mocked(mockHeygenService.getAvatars).mockResolvedValue(
        mockAvatars as never,
      );

      const result = await controller.getHeygenAvatars(makeUser());
      expect(result).toMatchObject({
        data: {
          attributes: { avatars: mockAvatars, provider: 'heygen' },
          id: 'heygen',
          type: 'avatar-provider',
        },
      });
    });

    it('should throw HttpException on failure', async () => {
      const controller = buildController();
      vi.mocked(mockHeygenService.getAvatars).mockRejectedValue(
        new Error('fail'),
      );

      await expect(controller.getHeygenAvatars(makeUser())).rejects.toThrow();
    });
  });

  describe('getHedraVoices', () => {
    it('should return Hedra voices', async () => {
      const controller = buildController();
      vi.mocked(mockHedraService.getVoices).mockResolvedValue([] as never);

      const result = await controller.getHedraVoices(makeUser());
      expect(result.data.attributes.provider).toBe('hedra');
    });

    it('should throw on failure', async () => {
      const controller = buildController();
      const error = new Error('x');
      vi.mocked(mockHedraService.getVoices).mockRejectedValue(error);

      await expect(controller.getHedraVoices(makeUser())).rejects.toThrow();
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        error,
      );
    });
  });

  describe('getElevenlabsVoices', () => {
    it('should return ElevenLabs voices', async () => {
      const controller = buildController();
      vi.mocked(mockElevenlabsService.getVoices).mockResolvedValue([] as never);

      const result = await controller.getElevenlabsVoices(makeUser());
      expect(result.data.attributes.provider).toBe('elevenlabs');
    });

    it('should throw on failure', async () => {
      const controller = buildController();
      vi.mocked(mockElevenlabsService.getVoices).mockRejectedValue(
        new Error('x'),
      );
      await expect(
        controller.getElevenlabsVoices(makeUser()),
      ).rejects.toThrow();
    });
  });

  describe('getHedraAvatars', () => {
    it('should return Hedra avatars', async () => {
      const controller = buildController();
      vi.mocked(mockHedraService.getAvatars).mockResolvedValue([] as never);

      const result = await controller.getHedraAvatars(makeUser());
      expect(result.data.attributes.provider).toBe('hedra');
    });

    it('should throw on failure', async () => {
      const controller = buildController();
      vi.mocked(mockHedraService.getAvatars).mockRejectedValue(new Error('x'));
      await expect(controller.getHedraAvatars(makeUser())).rejects.toThrow();
    });
  });

  describe('findAll', () => {
    const makeRequest = () =>
      ({
        get: () => 'app.test',
        originalUrl: '/v1/avatars',
        protocol: 'https',
      }) as unknown as Request;

    it('should filter avatars by category and tenant ownership', async () => {
      const controller = buildController();
      vi.mocked(mockAvatarsService.findAll).mockResolvedValue({
        docs: [],
      } as never);

      await controller.findAll(makeRequest(), makeUser(), {} as never);

      expect(mockAvatarsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: IngredientCategory.AVATAR,
            organizationId: orgId,
            userId,
          }),
        }),
        expect.anything(),
      );
      const [{ where }] = vi.mocked(mockAvatarsService.findAll).mock.calls[0];
      expect(where).not.toHaveProperty('type');
    });
  });
});
