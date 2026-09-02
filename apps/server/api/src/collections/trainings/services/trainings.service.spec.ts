import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import type { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import type { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';

const sourceImageId = testId('sourceimage');
const trainingId = testId('training');
const trainingBrandId = testId('trainingbrand');
const relaunchTrainingId = testId('relaunchtraining');

describe('TrainingsService', () => {
  let service: TrainingsService;
  let ingredientsService: {
    findAll: ReturnType<typeof vi.fn>;
    patchAll: ReturnType<typeof vi.fn>;
  };
  let modelsService: { findOne: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  const identity = {
    brandId: testId('brand'),
    organizationId: testId('org'),
    userId: testId('user'),
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
          .map(() => sourceImageId),
        steps: 1000,
        trigger: 'NEWTOK',
        type: 'subject',
        ...overrides,
      }) as unknown as CreateTrainingDto;

    it('throws when fewer than 10 sources are provided', async () => {
      await expect(
        service.createTrainingWithSources(
          buildCreateDto({ sources: ['a', 'b'] } as never),
          identity,
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
        identity,
      );

      const [aggregate] = ingredientsService.findAll.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];

      // A sibling `OR` key would overwrite the canonical id constraint and
      // silently match every image the caller owns.
      expect(aggregate.where).not.toHaveProperty('OR');
      expect(aggregate.where.AND).toEqual([
        { id: { in: sourceIds } },
        {
          OR: [
            { userId: identity.userId },
            { organizationId: identity.organizationId },
          ],
        },
      ]);
    });

    it('throws when fewer than 10 source images are found', async () => {
      ingredientsService.findAll.mockResolvedValueOnce({ docs: [] });

      await expect(
        service.createTrainingWithSources(buildCreateDto(), identity),
      ).rejects.toThrow(HttpException);
    });

    it('resolves the default trainer model when none is provided', async () => {
      const sourceIds = Array(10)
        .fill(null)
        .map(() => sourceImageId);
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
        identity,
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
        .map(() => sourceImageId);
      ingredientsService.findAll.mockResolvedValueOnce({
        docs: sourceIds.map((id) => ({ id, metadata: { extension: 'jpg' } })),
      });
      const createSpy = vi.spyOn(service, 'create').mockResolvedValueOnce({
        id: trainingId,
      } as unknown as TrainingDocument);

      const result = await service.createTrainingWithSources(
        buildCreateDto({ sources: sourceIds } as never),
        identity,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: identity.brandId,
          config: expect.objectContaining({
            model: 'default-trainer-model',
            status: IngredientStatus.PROCESSING,
            steps: 1000,
            trigger: 'NEWTOK',
          }),
          label: 'New Training',
          organizationId: identity.organizationId,
          sources: {
            connect: expect.arrayContaining([{ id: sourceImageId }]),
          },
          userId: identity.userId,
        }),
      );
      expect(result.training.id).toBe(trainingId);
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
        identity,
      );

      // One query regardless of source count — never one UPDATE per row.
      expect(ingredientsService.patchAll).toHaveBeenCalledTimes(1);
      expect(ingredientsService.patchAll).toHaveBeenCalledWith(
        {
          id: { in: sourceIds },
          OR: [
            { userId: identity.userId },
            { organizationId: identity.organizationId },
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
      brandId: trainingBrandId,
      config: {
        category: 'style',
        model: 'replicate/custom-model',
        provider: 'replicate',
        seed: 42,
        steps: 1200,
        trigger: 'MYTOK',
      },
      description: '',
      id: relaunchTrainingId,
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

      await service.relaunchTrainingWithSources(mockTraining, identity);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: trainingBrandId,
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
        service.relaunchTrainingWithSources(mockTraining, identity),
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

      await service.relaunchTrainingWithSources(mockTraining, identity);

      // One query regardless of source count — never one UPDATE per row.
      expect(ingredientsService.patchAll).toHaveBeenCalledTimes(1);
      expect(ingredientsService.patchAll).toHaveBeenCalledWith(
        {
          id: { in: mockTraining.sources },
          userId: identity.userId,
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

      await service.relaunchTrainingWithSources(mockTraining, identity);

      const pipelineArg = ingredientsService.findAll.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(pipelineArg.where.category).toBe('SOURCE');
      expect(pipelineArg.where).not.toHaveProperty('OR');
    });
  });
});
