import type { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { ModelCategory } from '@genfeedai/enums';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';

describe('ModelsGuard', () => {
  let guard: ModelsGuard;
  let reflector: Reflector;
  let modelRegistrationService: {
    validateModelForOrg: ReturnType<typeof vi.fn>;
  };

  const createContext = (
    body: Record<string, unknown> = {},
    organizationId = new Types.ObjectId().toString(),
  ): ExecutionContext => {
    const req: Record<string, unknown> = {
      body,
      context: { organizationId },
      selectedModel: undefined,
    };
    return {
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    modelRegistrationService = {
      validateModelForOrg: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        category: ModelCategory.IMAGE,
        key: 'stable-diffusion',
      }),
    };
    guard = new ModelsGuard(
      modelRegistrationService as unknown as ModelRegistrationService,
      reflector,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('returns true when no ValidateModel decorator is set', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    const result = await guard.canActivate(createContext());
    expect(result).toBe(true);
  });

  it('returns true when no model key is in the body', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    const result = await guard.canActivate(createContext({}));
    expect(result).toBe(true);
  });

  it('returns true for a valid model key matching the required category', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    const ctx = createContext({ model: 'stable-diffusion' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(modelRegistrationService.validateModelForOrg).toHaveBeenCalledWith(
      'stable-diffusion',
      expect.any(Types.ObjectId),
    );
  });

  it('sets selectedModel on request after validation', async () => {
    const mockModel = {
      _id: new Types.ObjectId(),
      category: ModelCategory.IMAGE,
      key: 'stable-diffusion',
    };
    modelRegistrationService.validateModelForOrg.mockResolvedValue(mockModel);
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    const ctx = createContext({ model: 'stable-diffusion' });
    await guard.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.selectedModel).toEqual(mockModel);
  });

  it('throws ForbiddenException when model category does not match', async () => {
    modelRegistrationService.validateModelForOrg.mockResolvedValue({
      _id: new Types.ObjectId(),
      category: ModelCategory.IMAGE,
      key: 'stable-diffusion',
    });
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.VIDEO,
    });
    const ctx = createContext({ model: 'stable-diffusion' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('allows model when category matches exactly', async () => {
    modelRegistrationService.validateModelForOrg.mockResolvedValue({
      _id: new Types.ObjectId(),
      category: ModelCategory.VIDEO,
      key: 'sora-turbo',
    });
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.VIDEO,
    });
    const ctx = createContext({ model: 'sora-turbo' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('allows model when model has no category set', async () => {
    modelRegistrationService.validateModelForOrg.mockResolvedValue({
      _id: new Types.ObjectId(),
      key: 'generic-model',
    });
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    const ctx = createContext({ model: 'generic-model' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('throws ForbiddenException when organizationId is missing', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    const req: Record<string, unknown> = {
      body: { model: 'stable-diffusion' },
      context: {},
      selectedModel: undefined,
    };
    const ctx = {
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('allows Replicate destination models to bypass validation', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    const ctx = createContext({ model: 'owner/model:abc123' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(modelRegistrationService.validateModelForOrg).not.toHaveBeenCalled();
  });

  it('allows fal destinations to bypass validation', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    const ctx = createContext({ model: 'fal-ai/flux-2-pro' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(modelRegistrationService.validateModelForOrg).not.toHaveBeenCalled();
  });

  it('uses custom fieldName from options', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
      fieldName: 'customModel',
    });
    const ctx = createContext({ customModel: 'stable-diffusion' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(modelRegistrationService.validateModelForOrg).toHaveBeenCalledWith(
      'stable-diffusion',
      expect.any(Types.ObjectId),
    );
  });

  it('ValidateModel is a Reflector decorator', () => {
    expect(ValidateModel).toBeDefined();
  });
});
