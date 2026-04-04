import { SkillRegistryController } from '@api/skills-pro/controllers/skill-registry.controller';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('SkillRegistryController', () => {
  let controller: SkillRegistryController;
  let skillRegistryService: {
    getRegistry: ReturnType<typeof vi.fn>;
  };

  const mockRegistry = {
    bundlePrice: 49,
    skills: [
      {
        category: 'generation',
        description: 'Generate images',
        name: 'Image Gen',
        s3Key: 'skills/image-gen.zip',
        slug: 'image-gen',
        version: '1.0.0',
      },
    ],
    updatedAt: '2026-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    skillRegistryService = {
      getRegistry: vi.fn().mockResolvedValue(mockRegistry),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillRegistryController],
      providers: [
        {
          provide: SkillRegistryService,
          useValue: skillRegistryService,
        },
      ],
    }).compile();

    controller = module.get<SkillRegistryController>(SkillRegistryController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getRegistry', () => {
    it('returns the skill registry from the service', async () => {
      const result = await controller.getRegistry();
      expect(result).toEqual(mockRegistry);
    });

    it('calls skillRegistryService.getRegistry once', async () => {
      await controller.getRegistry();
      expect(skillRegistryService.getRegistry).toHaveBeenCalledTimes(1);
    });

    it('calls getRegistry with no arguments', async () => {
      await controller.getRegistry();
      expect(skillRegistryService.getRegistry).toHaveBeenCalledWith();
    });

    it('propagates errors from the service', async () => {
      skillRegistryService.getRegistry.mockRejectedValue(
        new Error('CDN unreachable'),
      );
      await expect(controller.getRegistry()).rejects.toThrow('CDN unreachable');
    });

    it('returns registry with skills array', async () => {
      const result = (await controller.getRegistry()) as typeof mockRegistry;
      expect(Array.isArray(result.skills)).toBe(true);
      expect(result.skills.length).toBeGreaterThan(0);
    });

    it('returns registry with bundlePrice', async () => {
      const result = (await controller.getRegistry()) as typeof mockRegistry;
      expect(result.bundlePrice).toBe(49);
    });

    it('returns empty skills array when registry has no skills', async () => {
      skillRegistryService.getRegistry.mockResolvedValue({
        bundlePrice: 0,
        skills: [],
        updatedAt: '2026-01-01T00:00:00Z',
      });
      const result = (await controller.getRegistry()) as { skills: unknown[] };
      expect(result.skills).toEqual([]);
    });

    it('handles registry with zero bundle price', async () => {
      skillRegistryService.getRegistry.mockResolvedValue({
        bundlePrice: 0,
        skills: [],
        updatedAt: '2026-01-01T00:00:00Z',
      });
      const result = (await controller.getRegistry()) as {
        bundlePrice: number;
      };
      expect(result.bundlePrice).toBe(0);
    });
  });
});
