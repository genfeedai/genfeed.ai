import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { OrganizationSettingsService } from '../../organization-settings/services/organization-settings.service';
import { ModelRegistrationService } from './model-registration.service';

describe('ModelRegistrationService', () => {
  let service: ModelRegistrationService;
  let mockModelModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockOrgSettingsService: Partial<
    Record<keyof OrganizationSettingsService, ReturnType<typeof vi.fn>>
  >;

  const mockLoggerService: Partial<LoggerService> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const orgId = new Types.ObjectId();
  const otherOrgId = new Types.ObjectId();
  const modelId = new Types.ObjectId();

  const makeFindOne = (result: unknown) => ({
    lean: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(result),
    }),
  });

  beforeEach(() => {
    mockModelModel = {
      findOne: vi.fn().mockReturnValue(makeFindOne(null)),
    };

    mockOrgSettingsService = {
      findOne: vi.fn().mockResolvedValue(null),
    };

    service = new ModelRegistrationService(
      mockModelModel as never,
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
      enabledModels: [new Types.ObjectId(), new Types.ObjectId()],
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
});
