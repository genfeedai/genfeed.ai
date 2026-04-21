import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { CronIngredientsService } from '@workers/crons/ingredients/cron.ingredients.service';

describe('CronIngredientsService', () => {
  let service: CronIngredientsService;
  let activitiesService: vi.Mocked<ActivitiesService>;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let metadataService: vi.Mocked<MetadataService>;
  let filesClientService: vi.Mocked<FilesClientService>;
  let configService: vi.Mocked<ConfigService>;
  let cacheService: vi.Mocked<CacheService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockStuckIngredients = {
    docs: [
      {
        _id: 'ingredient-id-1',
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        status: IngredientStatus.PROCESSING,
      },
      {
        _id: 'ingredient-id-2',
        createdAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
        status: IngredientStatus.PROCESSING,
      },
    ],
  };

  const mockIngredientsNeedingRefresh = {
    docs: [
      {
        _id: 'ingredient-id-3',
        category: IngredientCategory.VIDEO,
        metadata: 'metadata-id-1',
        metadataDoc: {
          _id: 'metadata-doc-id-1',
        },
      },
      {
        _id: 'ingredient-id-4',
        category: IngredientCategory.IMAGE,
        metadata: 'metadata-id-2',
        metadataDoc: {
          _id: 'metadata-doc-id-2',
        },
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronIngredientsService,
        {
          provide: ActivitiesService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            findAll: vi.fn(),
            patchAll: vi.fn(),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            patch: vi.fn(),
          },
        },
        {
          provide: FilesClientService,
          useValue: {
            extractMetadataFromUrl: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            ingredientsEndpoint: 'https://test-ingredients',
          },
        },
        {
          provide: CacheService,
          useValue: {
            acquireLock: vi.fn().mockResolvedValue(true),
            releaseLock: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CronIngredientsService>(CronIngredientsService);
    activitiesService = module.get(ActivitiesService);
    ingredientsService = module.get(IngredientsService);
    metadataService = module.get(MetadataService);
    filesClientService = module.get(FilesClientService);
    configService = module.get(ConfigService);
    cacheService = module.get(CacheService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    activitiesService.findOne.mockReset();
    activitiesService.patch.mockReset();
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkStuckProcessingIngredients', () => {
    it('should find and mark stuck ingredients as FAILED', async () => {
      ingredientsService.findAll.mockResolvedValue(
        mockStuckIngredients as unknown as AggregatePaginateResult<IngredientEntity>,
      );
      ingredientsService.patchAll.mockResolvedValue({
        modifiedCount: 2,
      } as unknown as { modifiedCount: number });

      await service.checkStuckProcessingIngredients();

      expect(ingredientsService.findAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              isDeleted: false,
              status: IngredientStatus.PROCESSING,
            }),
          }),
        ]),
        expect.objectContaining({
          pagination: false,
        }),
      );

      expect(ingredientsService.patchAll).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: {
            $in: expect.arrayContaining([
              mockStuckIngredients.docs[0]._id,
              mockStuckIngredients.docs[1]._id,
            ]),
          },
          isDeleted: false,
          status: IngredientStatus.PROCESSING,
        }),
        {
          status: IngredientStatus.FAILED,
        },
      );

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Checking for stuck processing ingredients'),
        expect.any(String),
      );

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Found 2 stuck processing ingredients'),
        expect.any(Object),
      );
    });

    it('should skip if already running', async () => {
      cacheService.acquireLock.mockResolvedValueOnce(false);

      await service.checkStuckProcessingIngredients();

      expect(loggerService.debug).toHaveBeenCalledWith(
        expect.stringContaining('lock held'),
        expect.any(String),
      );
    });

    it('should handle no stuck ingredients found', async () => {
      ingredientsService.findAll.mockResolvedValue({
        docs: [],
      } as unknown as AggregatePaginateResult<IngredientEntity>);

      await service.checkStuckProcessingIngredients();

      expect(ingredientsService.patchAll).not.toHaveBeenCalled();
      expect(loggerService.debug).toHaveBeenCalledWith(
        expect.stringContaining('No stuck processing ingredients found'),
        expect.any(String),
      );
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      ingredientsService.findAll.mockRejectedValue(error);

      await service.checkStuckProcessingIngredients();

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Ingredient timeout check cycle failed'),
        error,
        expect.any(String),
      );
    });
  });

  describe('triggerTimeoutCheck', () => {
    it('should return found and updated counts', async () => {
      ingredientsService.findAll.mockResolvedValue(
        mockStuckIngredients as unknown as AggregatePaginateResult<IngredientEntity>,
      );
      ingredientsService.patchAll.mockResolvedValue({
        modifiedCount: 2,
      } as unknown as { modifiedCount: number });

      const result = await service.triggerTimeoutCheck();

      expect(result).toEqual({
        found: 2,
        updated: 2,
      });
    });

    it('should return zeros when no stuck ingredients found', async () => {
      ingredientsService.findAll.mockResolvedValue({
        docs: [],
      } as unknown as AggregatePaginateResult<IngredientEntity>);

      const result = await service.triggerTimeoutCheck();

      expect(result).toEqual({
        found: 0,
        updated: 0,
      });
    });
  });

  describe('refreshMissingMetadataDimensions', () => {
    it('should refresh metadata for ingredients with missing dimensions', async () => {
      ingredientsService.findAll.mockResolvedValue(
        mockIngredientsNeedingRefresh as unknown as AggregatePaginateResult<IngredientEntity>,
      );
      filesClientService.extractMetadataFromUrl.mockResolvedValue({
        duration: 30,
        hasAudio: true,
        height: 1080,
        size: 1024000,
        width: 1920,
      });
      metadataService.patch.mockResolvedValue({} as unknown as MetadataEntity);

      await service.refreshMissingMetadataDimensions();

      expect(ingredientsService.findAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              category: {
                $in: [IngredientCategory.VIDEO, IngredientCategory.IMAGE],
              },
              isDeleted: false,
              status: IngredientStatus.GENERATED,
            }),
          }),
        ]),
        expect.objectContaining({
          pagination: false,
        }),
      );

      expect(filesClientService.extractMetadataFromUrl).toHaveBeenCalledTimes(
        2,
      );
      expect(metadataService.patch).toHaveBeenCalledTimes(2);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Checking for completed ingredients with missing dimensions',
        ),
        expect.any(String),
      );
    });

    it('should update video metadata with duration and hasAudio', async () => {
      const videoIngredient = {
        docs: [
          {
            _id: 'ingredient-id-5',
            category: IngredientCategory.VIDEO,
            metadata: 'metadata-id-5',
            metadataDoc: {
              _id: 'metadata-doc-id-5',
            },
          },
        ],
      };

      ingredientsService.findAll.mockResolvedValue(
        videoIngredient as unknown as AggregatePaginateResult<IngredientEntity>,
      );
      filesClientService.extractMetadataFromUrl.mockResolvedValue({
        duration: 45,
        hasAudio: true,
        height: 1080,
        size: 1024000,
        width: 1920,
      });

      await service.refreshMissingMetadataDimensions();

      expect(metadataService.patch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          duration: 45,
          hasAudio: true,
          height: 1080,
          size: 1024000,
          width: 1920,
        }),
      );
    });

    it('should not update duration and hasAudio for images', async () => {
      const imageIngredient = {
        docs: [
          {
            _id: 'ingredient-id-6',
            category: IngredientCategory.IMAGE,
            metadata: 'metadata-id-6',
            metadataDoc: {
              _id: 'metadata-doc-id-6',
            },
          },
        ],
      };

      ingredientsService.findAll.mockResolvedValue(
        imageIngredient as unknown as AggregatePaginateResult<IngredientEntity>,
      );
      filesClientService.extractMetadataFromUrl.mockResolvedValue({
        height: 1080,
        size: 512000,
        width: 1920,
      });

      await service.refreshMissingMetadataDimensions();

      expect(metadataService.patch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          height: 1080,
          size: 512000,
          width: 1920,
        }),
      );

      const patchCall = metadataService.patch.mock.calls[0][1];
      expect(patchCall).not.toHaveProperty('duration');
      expect(patchCall).not.toHaveProperty('hasAudio');
    });

    it('should skip if already running', async () => {
      cacheService.acquireLock.mockResolvedValueOnce(false);

      await service.refreshMissingMetadataDimensions();

      expect(loggerService.debug).toHaveBeenCalledWith(
        expect.stringContaining('lock held'),
        expect.any(String),
      );
    });

    it('should handle no ingredients needing refresh', async () => {
      ingredientsService.findAll.mockResolvedValue({
        docs: [],
      } as unknown as AggregatePaginateResult<IngredientEntity>);

      await service.refreshMissingMetadataDimensions();

      expect(filesClientService.extractMetadataFromUrl).not.toHaveBeenCalled();
      expect(metadataService.patch).not.toHaveBeenCalled();
      expect(loggerService.debug).toHaveBeenCalledWith(
        expect.stringContaining('No ingredients with missing dimensions found'),
        expect.any(String),
      );
    });

    it('should handle invalid dimensions gracefully', async () => {
      const singleIngredient = {
        docs: [mockIngredientsNeedingRefresh.docs[0]],
      };

      ingredientsService.findAll.mockResolvedValue(
        singleIngredient as unknown as AggregatePaginateResult<IngredientEntity>,
      );
      filesClientService.extractMetadataFromUrl.mockResolvedValue({
        height: 0,
        size: 1024000,
        width: 0,
      });

      await service.refreshMissingMetadataDimensions();

      expect(metadataService.patch).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not extract valid dimensions'),
        expect.any(Object),
      );
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      ingredientsService.findAll.mockRejectedValue(error);

      await service.refreshMissingMetadataDimensions();

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Metadata refresh cycle failed'),
        error,
        expect.any(String),
      );
    });

    it('should handle individual ingredient errors', async () => {
      const singleIngredient = {
        docs: [mockIngredientsNeedingRefresh.docs[0]],
      };

      ingredientsService.findAll.mockResolvedValue(
        singleIngredient as unknown as AggregatePaginateResult<IngredientEntity>,
      );
      filesClientService.extractMetadataFromUrl.mockRejectedValue(
        new Error('Network error'),
      );

      await service.refreshMissingMetadataDimensions();

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to refresh metadata'),
        expect.any(Error),
        expect.any(String),
      );
    });
  });

  describe('triggerMetadataRefresh', () => {
    it('should trigger metadata refresh manually', async () => {
      ingredientsService.findAll.mockResolvedValue({
        docs: [],
      } as unknown as AggregatePaginateResult<IngredientEntity>);

      const result = await service.triggerMetadataRefresh();

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('triggered manually'),
      );
      expect(result).toEqual({
        failed: 0,
        found: 0,
        succeeded: 0,
      });
    });
  });

  describe('service initialization', () => {
    it('should initialize with all required services', () => {
      expect(service).toBeDefined();
      expect(ingredientsService).toBeDefined();
      expect(metadataService).toBeDefined();
      expect(filesClientService).toBeDefined();
      expect(configService).toBeDefined();
      expect(cacheService).toBeDefined();
      expect(loggerService).toBeDefined();
    });
  });
});
