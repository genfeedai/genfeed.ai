import { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentPatternType } from '@genfeedai/enums';
import { type PatternPlaybook } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('PlaybookBuilderService', () => {
  let service: PlaybookBuilderService;
  let patternStoreService: { findByOrganization: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  interface MockModel {
    collection: { name: string };
    create: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findByIdAndUpdate: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    modelName: string;
  }

  let model: MockModel;

  const orgId = 'test-object-id';
  const userId = 'test-object-id';
  const playbookId = 'test-object-id';

  const makePlaybook = (overrides = {}) => ({
    _id: playbookId,
    insights: {},
    name: 'Test Playbook',
    niche: 'fitness',
    organization: orgId,
    patternsCount: 0,
    platform: 'instagram',
    sourceCreators: [],
    ...overrides,
  });

  let lastSavedDto: Record<string, unknown> | null = null;

  beforeEach(async () => {
    lastSavedDto = null;

    const mockModelFn = function (
      this: Record<string, unknown>,
      dto: Record<string, unknown>,
    ) {
      Object.assign(this, dto);
      lastSavedDto = dto;
      this.save = vi.fn().mockResolvedValue(dto);
    } as unknown as MockModel;
    mockModelFn.collection = { name: 'pattern-playbooks' };
    mockModelFn.modelName = 'PatternPlaybook';
    mockModelFn.create = vi.fn();
    mockModelFn.find = vi
      .fn()
      .mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });
    mockModelFn.findOne = vi
      .fn()
      .mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    mockModelFn.findOneAndUpdate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    });
    mockModelFn.findByIdAndUpdate = vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      }),
    });
    model = mockModelFn;
    patternStoreService = { findByOrganization: vi.fn().mockResolvedValue([]) };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaybookBuilderService,
        { provide: PrismaService, useValue: model },
        { provide: PatternStoreService, useValue: patternStoreService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get(PlaybookBuilderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPlaybook', () => {
    it('should create a playbook with required fields', async () => {
      const result = await service.createPlaybook(orgId, userId, {
        name: 'Test Playbook',
        niche: 'fitness',
        platform: 'instagram',
      });

      expect(result).toBeDefined();
      expect(lastSavedDto).toEqual(
        expect.objectContaining({
          createdBy: userId,
          isActive: true,
          name: 'Test Playbook',
          niche: 'fitness',
          organization: orgId,
          platform: 'instagram',
        }),
      );
    });

    it('should initialize insights to empty state', async () => {
      await service.createPlaybook(orgId, userId, {
        name: 'New Playbook',
        niche: 'tech',
        platform: 'twitter',
      });

      expect(lastSavedDto).toEqual(
        expect.objectContaining({
          insights: expect.objectContaining({
            topHooks: [],
          }),
          patternsCount: 0,
        }),
      );
    });

    it('should include sourceCreators when provided', async () => {
      const creatorId = 'test-object-id';

      await service.createPlaybook(orgId, userId, {
        name: 'With Creators',
        niche: 'beauty',
        platform: 'instagram',
        sourceCreators: [creatorId],
      });

      expect(lastSavedDto).toEqual(
        expect.objectContaining({ sourceCreators: [creatorId] }),
      );
    });
  });

  describe('buildInsights', () => {
    it('should throw when playbook not found', async () => {
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(service.buildInsights(playbookId, orgId)).rejects.toThrow(
        'Playbook not found',
      );
    });

    it('should build insights from patterns and patch the playbook', async () => {
      const mockPlaybook = makePlaybook();
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockPlaybook),
      });

      const hookPattern = {
        extractedFormula: 'Hook formula',
        patternType: ContentPatternType.HOOK,
        sourceMetrics: {
          comments: 20,
          engagementRate: 0.12,
          likes: 100,
          shares: 5,
          views: 1000,
        },
        tags: ['fitness', 'gains'],
        templateCategory: 'list',
      };

      patternStoreService.findByOrganization.mockResolvedValue([hookPattern]);

      const updatedDoc = { ...mockPlaybook, patternsCount: 1 };
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(updatedDoc),
        }),
      });

      const result = await service.buildInsights(playbookId, orgId);
      expect(result).toBe(updatedDoc);
      expect(model.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should calculate benchmarks as zeroes when no patterns exist', async () => {
      const mockPlaybook = makePlaybook();
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockPlaybook),
      });
      patternStoreService.findByOrganization.mockResolvedValue([]);

      const updatedDoc = { ...mockPlaybook, patternsCount: 0 };
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(updatedDoc),
        }),
      });

      await service.buildInsights(playbookId, orgId);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            patternsCount: 0,
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('addCreatorToPlaybook', () => {
    it('should throw when playbook not found', async () => {
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.addCreatorToPlaybook(playbookId, 'test-object-id', orgId),
      ).rejects.toThrow('Playbook not found');
    });

    it('should add creator to sourceCreators array', async () => {
      const creatorId = 'test-object-id';
      const mockPlaybook = makePlaybook({ sourceCreators: [] });
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockPlaybook),
      });
      const updatedPlaybook = { ...mockPlaybook, sourceCreators: [creatorId] };
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(updatedPlaybook),
        }),
      });

      const result = await service.addCreatorToPlaybook(
        playbookId,
        creatorId,
        orgId,
      );
      expect(result).toBeDefined();
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            sourceCreators: expect.arrayContaining([creatorId]),
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('removeCreatorFromPlaybook', () => {
    it('should throw when playbook not found', async () => {
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.removeCreatorFromPlaybook(playbookId, 'test-object-id', orgId),
      ).rejects.toThrow('Playbook not found');
    });

    it('should remove the specified creator from sourceCreators', async () => {
      const creatorToRemove = 'test-object-id';
      const otherCreator = 'test-object-id';
      const mockPlaybook = makePlaybook({
        sourceCreators: [otherCreator, creatorToRemove],
      });
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockPlaybook),
      });
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({
            ...mockPlaybook,
            sourceCreators: [otherCreator],
          }),
        }),
      });

      await service.removeCreatorFromPlaybook(
        playbookId,
        creatorToRemove,
        orgId,
      );

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            sourceCreators: [otherCreator],
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('findByOrganization', () => {
    it('should call findAllByOrganization with orgId string', async () => {
      const chainable = {
        lean: vi.fn().mockResolvedValue([makePlaybook()]),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };
      model.find = vi.fn().mockReturnValue(chainable);

      const result = await service.findByOrganization(orgId);
      expect(result).toBeDefined();
    });
  });
});
