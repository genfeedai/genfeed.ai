import { AvatarsController } from '@api/collections/avatars/controllers/avatars.controller';
import type { AvatarsService } from '@api/collections/avatars/services/avatars.service';
import type { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import type { HedraService } from '@api/services/integrations/hedra/services/hedra.service';
import type { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type { User } from '@clerk/backend';
import type { LoggerService } from '@libs/logger/logger.service';

const userId = '507f191e810c19729de860ee'.toString();
const orgId = '507f191e810c19729de860ee'.toString();
const brandId = '507f191e810c19729de860ee'.toString();

const makeUser = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: 'clerk-user-1',
    publicMetadata: {
      brand: brandId,
      isSuperAdmin: false,
      organization: orgId,
      user: userId,
      ...overrides,
    },
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
      vi.mocked(mockHedraService.getVoices).mockRejectedValue(new Error('x'));
      await expect(controller.getHedraVoices(makeUser())).rejects.toThrow();
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
});
