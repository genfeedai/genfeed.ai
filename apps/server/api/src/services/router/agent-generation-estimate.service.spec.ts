import { ModelsService } from '@api/collections/models/services/models.service';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { RouterService } from '@api/services/router/router.service';
import { ModelCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('AgentGenerationEstimateService', () => {
  let service: AgentGenerationEstimateService;
  let routerService: { selectModel: ReturnType<typeof vi.fn> };
  let modelsService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    routerService = { selectModel: vi.fn() };
    modelsService = { findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentGenerationEstimateService,
        { provide: RouterService, useValue: routerService },
        { provide: ModelsService, useValue: modelsService },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
      ],
    }).compile();

    service = module.get(AgentGenerationEstimateService);
  });

  it('prices an image request with the image quality multiplier and output count', async () => {
    routerService.selectModel.mockResolvedValue({
      modelDetails: { cost: 50, key: 'openai/gpt-image-2', category: 'image' },
    });
    modelsService.findOne.mockResolvedValue({
      key: 'openai/gpt-image-2',
      costPerUnit: null,
      minCost: null,
      pricingType: null,
    });

    const result = await service.estimate({
      category: ModelCategory.IMAGE,
      organizationId: 'org-1',
      outputs: 2,
      prompt: 'a red car',
      quality: 'low',
    });

    expect(result.isAvailable).toBe(true);
    expect(result.modelKey).toBe('openai/gpt-image-2');
    // 50 base * 0.112 (gpt-image low quality) = 5.6 -> ceil 6, * 2 outputs = 12
    expect(result.credits).toBe(12);
  });

  it('prices a video request with duration and resolution multipliers', async () => {
    routerService.selectModel.mockResolvedValue({
      modelDetails: { cost: 100, key: 'some/video-model', category: 'video' },
    });
    modelsService.findOne.mockResolvedValue({
      key: 'some/video-model',
      costPerUnit: 10,
      minCost: 50,
      pricingType: 'per-second',
    });

    const result = await service.estimate({
      category: ModelCategory.VIDEO,
      duration: 8,
      organizationId: 'org-1',
      outputs: 1,
      prompt: 'a drone shot of the coast',
    });

    expect(result.isAvailable).toBe(true);
    // per-second: 8 * 10 = 80, max(80, minCost 50) = 80, no resolution multiplier
    expect(result.credits).toBe(80);
  });

  it('reports the estimate unavailable when no model resolves, without throwing', async () => {
    routerService.selectModel.mockRejectedValue(
      new Error('No Recommended models enabled for this workspace'),
    );

    const result = await service.estimate({
      category: ModelCategory.IMAGE,
      organizationId: 'org-1',
      prompt: 'a red car',
    });

    expect(result).toEqual({
      credits: null,
      isAvailable: false,
      modelKey: null,
    });
  });

  it('reports the estimate unavailable when the resolved model has no pricing row', async () => {
    routerService.selectModel.mockResolvedValue({
      modelDetails: { cost: 50, key: 'orphaned/model', category: 'image' },
    });
    modelsService.findOne.mockResolvedValue(null);

    const result = await service.estimate({
      category: ModelCategory.IMAGE,
      organizationId: 'org-1',
      prompt: 'a red car',
    });

    expect(result).toEqual({
      credits: null,
      isAvailable: false,
      modelKey: 'orphaned/model',
    });
  });

  it('only scopes to this organization — never trusts a caller-supplied organizationId beyond what it is given', async () => {
    routerService.selectModel.mockResolvedValue({
      modelDetails: { cost: 50, key: 'openai/gpt-image-2', category: 'image' },
    });
    modelsService.findOne.mockResolvedValue({
      key: 'openai/gpt-image-2',
      costPerUnit: null,
      minCost: null,
      pricingType: null,
    });

    await service.estimate({
      category: ModelCategory.IMAGE,
      organizationId: 'org-42',
      prompt: 'a red car',
    });

    expect(routerService.selectModel).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-42' }),
    );
  });
});
