import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import type { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { IngredientStatus } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import type { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import type { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

describe('TrainingsService', () => {
  let service: TrainingsService;
  let ingredientsService: {
    findAll: ReturnType<typeof vi.fn>;
    patchAll: ReturnType<typeof vi.fn>;
  };
  let modelsService: { findOne: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  const publicMetadata = {
    brand: '507f191e810c19729de860ee',
    organization: '507f191e810c19729de860ee',
    user: '507f191e810c19729de860ee',
  };

  beforeEach(() => {
    ingredientsService = {
      findAll: vi.fn(),
      patchAll: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    modelsService = { findOne: vi.fn() };
    configService = {
      get: vi.fn((key: string) =>
        key === 'REPLICATE_MODELS_TRAINER' ? 'default-trainer-model' : null,
      ),
    };

    service = new TrainingsService(
      {} as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      configService as unknown as ConfigService,
      {} as FilesClientService,
      {} as FileQueueService,
      ingredientsService as unknown as IngredientsService,
      modelsService as unknown as ModelsService,
      {} as ReplicateService,
      {
        publishTrainingStatus: vi.fn(),
      } as unknown as NotificationsPublisherService,
      { checkMemory: vi.fn() } as unknown as MemoryMonitorService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createTrainingWithSources', () => {
    const buildCreateDto = (
      overrides: Partial<CreateTrainingDto> = {},
    ): CreateTrainingDto =>
      ({
        label: 'New Training',
        sources: Array(10)
          .fill(null)
          .map(() => '507f191e810c19729de860ee'.toString()),
        steps: 1000,
        trigger: 'NEWTOK',
        type: 'subject',
        ...overrides,
      }) as unknown as CreateTrainingDto;

    it('throws when fewer than 10 sources are provided', async () => {
      await expect(
        service.createTrainingWithSources(
          buildCreateDto({ sources: ['a', 'b'] } as never),
          publicMetadata,
        ),
      ).rejects.toThrow(HttpException);
      expect(ingredientsService.findAll).not.toHaveBeenCalled();
    });

    it('nests the id filter and the ownership filter under AND so neither is dropped', async () => {
      const sourceIds = Array.from({ length: 12 }, (_, i) => `source-${i}`);
      ingredientsService.findAll.mockResolvedValueOnce({
        docs: sourceIds.map((id) => ({ id, metadata: { extension: 'jpg' } })),
      });
      vi.spyOn(service, 'create').mockResolvedValueOnce({
        id: 'training-1',
      } as unknown as TrainingDocument);

      await service.createTrainingWithSources(
        buildCreateDto({ sources: sourceIds } as never),
        publicMetadata,
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];

      // A sibling `OR` key would overwrite the `_id` expansion in
      // `processSearchParams` and silently match every image the caller owns.
      expect(aggregate.where).not.toHaveProperty('OR');
      expect(aggregate.where.AND).toEqual([
        { _id: { in: sourceIds } },
        {
          OR: [
            { user: publicMetadata.user },
            { organization: publicMetadata.organization },
          ],
        },
      ]);
    });

    it('throws when fewer than 10 source images are found', async () => {
      ingredientsService.findAll.mockResolvedValueOnce({ docs: [] });

      await expect(
        service.createTrainingWithSources(buildCreateDto(), publicMetadata),
      ).rejects.toThrow(HttpException);
    });

    it('resolves the default trainer model when none is provided', async () => {
      const sourceIds = Array(10)
        .fill(null)
        .map(() => '507f191e810c19729de860ee'.toString());
      ingredientsService.findAll.mockResolvedValueOnce({
        docs: sourceIds.map((id) => ({ id, metadata: { extension: 'jpg' } })),
      });
      modelsService.findOne.mockResolvedValueOnce({
        key: `${MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER}:version123`,
      });
      const createSpy = vi.spyOn(service, 'create').mockResolvedValueOnce({
        id: 'training-1',
      } as unknown as TrainingDocument);

      await service.createTrainingWithSources(
        buildCreateDto({ sources: sourceIds } as never),
        publicMetadata,
      );

      expect(modelsService.findOne).toHaveBeenCalled();
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            model: `${MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER}:version123`,
          }),
        }),
      );
    });

    it('creates the training with the resolved source images and default trainer model', async () => {
      const sourceIds = Array(10)
        .fill(null)
        .map(() => '507f191e810c19729de860ee'.toString());
      ingredientsService.findAll.mockResolvedValueOnce({
        docs: sourceIds.map((id) => ({ id, metadata: { extension: 'jpg' } })),
      });
      const createSpy = vi.spyOn(service, 'create').mockResolvedValueOnce({
        id: '507f191e810c19729de860ee',
      } as unknown as TrainingDocument);

      const result = await service.createTrainingWithSources(
        buildCreateDto({ sources: sourceIds } as never),
        publicMetadata,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: publicMetadata.brand,
          config: expect.objectContaining({
            model: 'default-trainer-model',
            status: IngredientStatus.PROCESSING,
            steps: 1000,
            trigger: 'NEWTOK',
          }),
          label: 'New Training',
          organizationId: publicMetadata.organization,
          sources: {
            connect: expect.arrayContaining([
              { id: '507f191e810c19729de860ee' },
            ]),
          },
          userId: publicMetadata.user,
        }),
      );
      expect(result.training.id).toBe('507f191e810c19729de860ee');
      expect(result.sourceImages).toHaveLength(10);
    });

    it('marks every source image with one bounded tenant-scoped bulk update', async () => {
      const sourceIds = Array.from({ length: 12 }, (_, i) => `source-${i}`);
      ingredientsService.findAll.mockResolvedValueOnce({
        docs: sourceIds.map((id) => ({ id, metadata: { extension: 'jpg' } })),
      });
      vi.spyOn(service, 'create').mockResolvedValueOnce({
        id: 'training-1',
      } as unknown as TrainingDocument);

      await service.createTrainingWithSources(
        buildCreateDto({ sources: sourceIds } as never),
        publicMetadata,
      );

      // One query regardless of source count — never one UPDATE per row.
      expect(ingredientsService.patchAll).toHaveBeenCalledTimes(1);
      expect(ingredientsService.patchAll).toHaveBeenCalledWith(
        {
          id: { in: sourceIds },
          OR: [
            { userId: publicMetadata.user },
            { organizationId: publicMetadata.organization },
          ],
        },
        {
          category: 'SOURCE',
          // Scalar FK — the legacy `training` relation alias never resolves.
          trainingId: 'training-1',
        },
      );
    });
  });

  describe('relaunchTrainingWithSources', () => {
    const mockTraining = {
      brandId: '507f1f77bcf86cd799439013',
      config: {
        category: 'style',
        model: 'replicate/custom-model',
        provider: 'replicate',
        seed: 42,
        steps: 1200,
        trigger: 'MYTOK',
      },
      description: '',
      id: '507f1f77bcf86cd799439014',
      label: 'Custom Model',
      sources: Array.from(
        { length: 10 },
        (_, i) => `507f1f77bcf86cd79943${String(i).padStart(4, '0')}`,
      ),
    } as unknown as TrainingDocument;

    it('builds the relaunch config from the training nested config, not top-level fields', async () => {
      ingredientsService.findAll.mockResolvedValueOnce({
        docs: (mockTraining.sources as unknown as string[]).map((id) => ({
          id,
          metadata: { extension: 'jpg' },
        })),
      });
      const createSpy = vi.spyOn(service, 'create').mockResolvedValueOnce({
        id: 'training-2',
      } as unknown as TrainingDocument);

      await service.relaunchTrainingWithSources(mockTraining, publicMetadata);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: '507f1f77bcf86cd799439013',
          config: expect.objectContaining({
            category: 'style',
            model: 'replicate/custom-model',
            provider: 'replicate',
            seed: 42,
            steps: 1200,
            trigger: 'MYTOK',
          }),
        }),
      );
    });

    it('throws when fewer than 10 source images are found', async () => {
      ingredientsService.findAll.mockResolvedValueOnce({ docs: [] });

      await expect(
        service.relaunchTrainingWithSources(mockTraining, publicMetadata),
      ).rejects.toThrow(HttpException);
    });

    it('marks every source image with one bounded owner-scoped bulk update', async () => {
      ingredientsService.findAll.mockResolvedValueOnce({
        docs: (mockTraining.sources as unknown as string[]).map((id) => ({
          id,
          metadata: { extension: 'jpg' },
        })),
      });
      vi.spyOn(service, 'create').mockResolvedValueOnce({
        id: mockTraining.id,
      } as unknown as TrainingDocument);

      await service.relaunchTrainingWithSources(mockTraining, publicMetadata);

      // One query regardless of source count — never one UPDATE per row.
      expect(ingredientsService.patchAll).toHaveBeenCalledTimes(1);
      expect(ingredientsService.patchAll).toHaveBeenCalledWith(
        {
          id: { in: mockTraining.sources },
          userId: publicMetadata.user,
        },
        {
          category: 'SOURCE',
          // Scalar FK — the legacy `training` relation alias never resolves.
          trainingId: mockTraining.id,
        },
      );
    });

    it('should fetch ingredients with source category filter', async () => {
      ingredientsService.findAll.mockResolvedValueOnce({
        docs: (mockTraining.sources as unknown as string[]).map((id) => ({
          id,
          metadata: { extension: 'jpg' },
        })),
      });
      vi.spyOn(service, 'create').mockResolvedValueOnce({
        id: mockTraining.id,
      } as unknown as TrainingDocument);

      await service.relaunchTrainingWithSources(mockTraining, publicMetadata);

      const pipelineArg = ingredientsService.findAll.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(pipelineArg.where.category).toBe('SOURCE');
      expect(pipelineArg.where).not.toHaveProperty('OR');
    });
  });
});
