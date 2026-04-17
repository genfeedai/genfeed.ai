import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { OrganizationSettingsService } from '../../organization-settings/services/organization-settings.service';
import type { TrainingDocument } from '../../trainings/schemas/training.schema';
import { ModelRegistrationService } from './model-registration.service';

describe('ModelRegistrationService', () => {
  let service: ModelRegistrationService;
  let mockModelModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockTrainingModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockOrgSettingsService: Partial<
    Record<keyof OrganizationSettingsService, ReturnType<typeof vi.fn>>
  >;

  const mockLoggerService: Partial<LoggerService> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const orgId = 'test-object-id';
  const otherOrgId = 'test-object-id';
  const modelId = 'test-object-id';

  const makeFindOne = (result: unknown) => ({
    lean: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(result),
    }),
  });

  beforeEach(() => {
    mockModelModel = {
      create: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn().mockReturnValue(makeFindOne(null)),
    };

    mockTrainingModel = {
      aggregate: vi.fn().mockResolvedValue([]),
    };

    mockOrgSettingsService = {
      addEnabledModel: vi.fn().mockResolvedValue(undefined),
      findOne: vi.fn().mockResolvedValue(null),
    };

    service = new ModelRegistrationService(
      mockModelModel as never,
      mockTrainingModel as never,
      mockOrgSettingsService as unknown as OrganizationSettingsService,
      mockLoggerService as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws BadRequestException for unknown model', async () => {
    mockModelModel.findOne.mockReturnValue(makeFindOne(null));

    await expect(
      service.validateModelForOrg('unknown-model-key', orgId),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ForbiddenException for model belonging to a different org', async () => {
    const model = {
      _id: modelId,
      key: 'google/imagen-4',
      isDeleted: false,
      organization: otherOrgId,
    };
    mockModelModel.findOne.mockReturnValue(makeFindOne(model));

    await expect(
      service.validateModelForOrg('google/imagen-4', orgId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when model is not in org enabledModels', async () => {
    const model = {
      _id: modelId,
      key: 'google/imagen-4',
      isDeleted: false,
      organization: null,
    };
    mockModelModel.findOne.mockReturnValue(makeFindOne(model));

    // orgSettings with different model IDs — not including modelId
    mockOrgSettingsService.findOne = vi.fn().mockResolvedValue({
      enabledModels: ['test-object-id', 'test-object-id'],
    });

    await expect(
      service.validateModelForOrg('google/imagen-4', orgId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns model for valid system model (organization: null) in enabledModels', async () => {
    const model = {
      _id: modelId,
      key: 'google/imagen-4',
      isDeleted: false,
      organization: null,
    };
    mockModelModel.findOne.mockReturnValue(makeFindOne(model));

    mockOrgSettingsService.findOne = vi.fn().mockResolvedValue({
      enabledModels: [modelId],
    });

    const result = await service.validateModelForOrg('google/imagen-4', orgId);
    expect(result).toEqual(model);
  });

  it('returns model for own org trained model in enabledModels', async () => {
    const model = {
      _id: modelId,
      key: 'genfeed-ai/custom-trained-flux',
      isDeleted: false,
      organization: orgId,
    };
    mockModelModel.findOne.mockReturnValue(makeFindOne(model));

    mockOrgSettingsService.findOne = vi.fn().mockResolvedValue({
      enabledModels: [modelId],
    });

    const result = await service.validateModelForOrg(
      'genfeed-ai/custom-trained-flux',
      orgId,
    );
    expect(result).toEqual(model);
  });

  it('queries model by key with isDeleted: false', async () => {
    const model = {
      _id: modelId,
      key: 'google/imagen-4',
      isDeleted: false,
      organization: null,
    };
    mockModelModel.findOne.mockReturnValue(makeFindOne(model));

    mockOrgSettingsService.findOne = vi.fn().mockResolvedValue({
      enabledModels: [modelId],
    });

    await service.validateModelForOrg('google/imagen-4', orgId);

    expect(mockModelModel.findOne).toHaveBeenCalledWith({
      key: 'google/imagen-4',
      isDeleted: false,
    });
  });

  describe('createFromTraining', () => {
    const trainingId = 'test-object-id';
    const parentModelId = 'test-object-id';

    const makeTraining = (overrides: Partial<TrainingDocument> = {}) =>
      ({
        _id: trainingId,
        organization: orgId,
        label: 'My LoRA',
        trigger: 'MYLORA',
        baseModel: 'black-forest-labs/flux-dev',
        model: 'replicate/fast-flux-trainer:abc123',
        ...overrides,
      }) as unknown as TrainingDocument;

    it('creates a new model record from training', async () => {
      const training = makeTraining();
      const parentModel = {
        _id: parentModelId,
        key: 'black-forest-labs/flux-dev',
        category: 'IMAGE',
        cost: 2,
        capabilities: ['text-to-image'],
        supportsFeatures: ['cfg-scale'],
      };
      const createdModel = {
        _id: 'test-object-id',
        key: `genfeed-ai/${orgId}/${trainingId}`,
      };

      // First call: idempotent check returns null
      // Second call: parent model lookup returns parentModel
      mockModelModel.findOne
        .mockReturnValueOnce(makeFindOne(null))
        .mockReturnValueOnce(makeFindOne(parentModel));
      mockModelModel.create.mockResolvedValue(createdModel);

      const result = await service.createFromTraining(training);

      expect(result.key).toBe(`genfeed-ai/${orgId}/${trainingId}`);
      expect(mockModelModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: `genfeed-ai/${orgId}/${trainingId}`,
          organization: orgId,
          training: trainingId,
          parentModel: parentModelId,
          triggerWord: 'MYLORA',
          supportsFeatures: expect.arrayContaining([
            'lora-weights',
            'cfg-scale',
          ]),
        }),
      );
      expect(mockOrgSettingsService.addEnabledModel).toHaveBeenCalledWith(
        orgId,
        createdModel._id,
      );
    });

    it('returns existing model if already created (idempotent)', async () => {
      const training = makeTraining();
      const existingModel = {
        _id: 'test-object-id',
        key: `genfeed-ai/${orgId}/${trainingId}`,
        training: trainingId,
      };

      mockModelModel.findOne.mockReturnValueOnce(makeFindOne(existingModel));

      const result = await service.createFromTraining(training);

      expect(result).toEqual(existingModel);
      expect(mockModelModel.create).not.toHaveBeenCalled();
    });

    it('handles E11000 duplicate key error gracefully', async () => {
      const training = makeTraining();
      const raceWinnerModel = {
        _id: 'test-object-id',
        key: `genfeed-ai/${orgId}/${trainingId}`,
        training: trainingId,
      };

      // First findOne: no existing, Second findOne: no parent, Third findOne: race winner
      mockModelModel.findOne
        .mockReturnValueOnce(makeFindOne(null))
        .mockReturnValueOnce(makeFindOne(null))
        .mockReturnValueOnce(makeFindOne(raceWinnerModel));

      const duplicateError = Object.assign(new Error('E11000'), {
        code: 11000,
      });
      mockModelModel.create.mockRejectedValue(duplicateError);

      const result = await service.createFromTraining(training);

      expect(result).toEqual(raceWinnerModel);
    });

    it('creates model without parent when base model not found', async () => {
      const training = makeTraining();
      const createdModel = {
        _id: 'test-object-id',
        key: `genfeed-ai/${orgId}/${trainingId}`,
      };

      // Both findOnes return null (no existing, no parent)
      mockModelModel.findOne
        .mockReturnValueOnce(makeFindOne(null))
        .mockReturnValueOnce(makeFindOne(null));
      mockModelModel.create.mockResolvedValue(createdModel);

      await service.createFromTraining(training);

      expect(mockModelModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          parentModel: null,
          category: 'IMAGE',
          cost: 1,
          capabilities: [],
          supportsFeatures: ['lora-weights'],
        }),
      );
    });
  });

  describe('reconcileTrainingModels', () => {
    it('calls createFromTraining for each orphaned training', async () => {
      const trainingId = 'test-object-id';
      const orphanedTraining = {
        _id: trainingId,
        organization: orgId,
        label: 'Orphaned LoRA',
        trigger: 'ORPHAN',
        baseModel: 'black-forest-labs/flux-dev',
        model: 'replicate/fast-flux-trainer:abc123',
        status: 'COMPLETED',
        isDeleted: false,
      };

      mockTrainingModel.aggregate.mockResolvedValue([orphanedTraining]);

      const createFromTrainingSpy = vi
        .spyOn(service, 'createFromTraining')
        .mockResolvedValue({ _id: 'test-object-id' } as never);

      await service.reconcileTrainingModels();

      expect(mockTrainingModel.aggregate).toHaveBeenCalledWith([
        { $match: { status: 'COMPLETED', isDeleted: false } },
        {
          $lookup: {
            from: 'models',
            localField: '_id',
            foreignField: 'training',
            as: 'model',
          },
        },
        { $match: { model: { $size: 0 } } },
      ]);
      expect(createFromTrainingSpy).toHaveBeenCalledWith(orphanedTraining);
      expect(createFromTrainingSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconcileEnabledModels', () => {
    it('calls addEnabledModel for models missing from org enabledModels', async () => {
      const modelId2 = 'test-object-id';
      const orgModel = {
        _id: modelId2,
        organization: orgId,
      };

      mockModelModel.find.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue([orgModel]),
          }),
        }),
      });

      // orgSettings returns empty enabledModels — model is not yet enabled
      mockOrgSettingsService.findOne = vi.fn().mockResolvedValue({
        enabledModels: [],
      });

      await service.reconcileEnabledModels();

      expect(mockOrgSettingsService.addEnabledModel).toHaveBeenCalledWith(
        expect.any(String),
        modelId2,
      );
      expect(mockOrgSettingsService.addEnabledModel).toHaveBeenCalledTimes(1);
    });
  });
});
