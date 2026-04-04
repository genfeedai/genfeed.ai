import type { ModelsService } from '@api/collections/models/services/models.service';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { ModelCategory } from '@genfeedai/enums';
import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('ModelsGuard', () => {
  let guard: ModelsGuard;
  let reflector: Reflector;
  let modelsService: { findAll: ReturnType<typeof vi.fn> };

  const createContext = (
    body: Record<string, unknown> = {},
  ): ExecutionContext => {
    const req: Record<string, unknown> = {
      body,
      selectedModel: undefined,
      validModels: undefined,
    };
    return {
      getClass: vi.fn(),
      getHandler: vi.fn(),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    modelsService = {
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
    };
    guard = new ModelsGuard(
      modelsService as unknown as ModelsService,
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

  it('returns true for a valid model key found in database', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    modelsService.findAll.mockResolvedValue({
      docs: [{ key: 'stable-diffusion' }],
    });
    const ctx = createContext({ model: 'stable-diffusion' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('throws HttpException for an invalid model key', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    modelsService.findAll.mockResolvedValue({
      docs: [{ key: 'stable-diffusion' }],
    });
    const ctx = createContext({ model: 'nonexistent-model' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('sets validModels and selectedModel on request', async () => {
    const models = [{ key: 'stable-diffusion' }, { key: 'dall-e' }];
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    modelsService.findAll.mockResolvedValue({ docs: models });
    const ctx = createContext({ model: 'stable-diffusion' });
    await guard.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.validModels).toEqual(models);
    expect(req.selectedModel).toEqual({ key: 'stable-diffusion' });
  });

  it('allows Replicate destination models to bypass validation', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    const ctx = createContext({ model: 'owner/model:abc123' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(modelsService.findAll).not.toHaveBeenCalled();
  });

  it('allows fal destinations to bypass validation', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    const ctx = createContext({ model: 'fal-ai/flux-2-pro' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(modelsService.findAll).not.toHaveBeenCalled();
  });

  it('does not bypass validation for genfeed-ai self-hosted models', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
    });
    modelsService.findAll.mockResolvedValue({
      docs: [{ key: 'genfeed-ai/z-image-turbo' }],
    });

    const ctx = createContext({ model: 'genfeed-ai/z-image-turbo' });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(modelsService.findAll).toHaveBeenCalled();
  });

  it('uses custom fieldName from options', async () => {
    vi.spyOn(reflector, 'get').mockReturnValue({
      category: ModelCategory.IMAGE,
      fieldName: 'customModel',
    });
    modelsService.findAll.mockResolvedValue({
      docs: [{ key: 'dall-e' }],
    });
    const ctx = createContext({ customModel: 'dall-e' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('ValidateModel is a Reflector decorator', () => {
    expect(ValidateModel).toBeDefined();
  });
});
