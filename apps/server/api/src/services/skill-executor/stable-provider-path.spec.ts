import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { ManagedInferenceClientService } from '@api/endpoints/v1/managed-inference/managed-inference-client.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { FalService } from '@api/services/integrations/fal/fal.service';
import { ContentGeoOptimizerHandler } from '@api/services/skill-executor/handlers/content-geo-optimizer.handler';
import { ContentWritingHandler } from '@api/services/skill-executor/handlers/content-writing.handler';
import { ImageGenerationHandler } from '@api/services/skill-executor/handlers/image-generation.handler';
import { TrendDiscoveryHandler } from '@api/services/skill-executor/handlers/trend-discovery.handler';
import { TrendRemixHandler } from '@api/services/skill-executor/handlers/trend-remix.handler';
import { SkillExecutorService } from '@api/services/skill-executor/skill-executor.service';
import {
  ByokProvider,
  ContentRunSource,
  ContentRunStatus,
  ImageTaskModel,
} from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';
import { LeonardoAIService } from '@server/services/integrations/leonardoai/services/leonardoai.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('stable provider path smoke', () => {
  const organizationId = 'org-v1';
  const brandId = 'brand-v1';
  const runId = 'run-v1';

  const skillsService = {
    assertBrandSkillEnabled: vi.fn(),
    getSkillById: vi.fn(),
  };

  const contentRunsService = {
    createRun: vi.fn(),
    patchRun: vi.fn(),
  };

  const byokProviderFactoryService = {
    resolveProvider: vi.fn(),
  };

  const falService = {
    generateImage: vi.fn(),
  };

  const leonardoAIService = {
    generateImage: vi.fn(),
  };

  const replicateService = {
    runModel: vi.fn(),
  };

  const managedInferenceClientService = {
    generateImage: vi.fn(),
  };

  let skillExecutorService: SkillExecutorService;

  beforeEach(async () => {
    vi.clearAllMocks();

    contentRunsService.createRun.mockResolvedValue({ id: runId });
    contentRunsService.patchRun.mockResolvedValue({});
    skillsService.assertBrandSkillEnabled.mockResolvedValue(undefined);
    skillsService.getSkillById.mockResolvedValue({
      isEnabled: true,
      requiredProviders: [ByokProvider.FAL],
      slug: 'image-generation',
    });
    byokProviderFactoryService.resolveProvider.mockResolvedValue({
      apiKey: 'fal-byok-key',
      source: 'byok',
    });
    falService.generateImage.mockResolvedValue({
      url: 'https://assets.example/v1-smoke.jpg',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillExecutorService,
        ImageGenerationHandler,
        {
          provide: SkillsService,
          useValue: skillsService,
        },
        {
          provide: ContentRunsService,
          useValue: contentRunsService,
        },
        {
          provide: ByokProviderFactoryService,
          useValue: byokProviderFactoryService,
        },
        {
          provide: FalService,
          useValue: falService,
        },
        {
          provide: LeonardoAIService,
          useValue: leonardoAIService,
        },
        {
          provide: ReplicateService,
          useValue: replicateService,
        },
        {
          provide: ManagedInferenceClientService,
          useValue: managedInferenceClientService,
        },
        {
          provide: ContentGeoOptimizerHandler,
          useValue: { execute: vi.fn() },
        },
        {
          provide: ContentWritingHandler,
          useValue: { execute: vi.fn() },
        },
        {
          provide: TrendDiscoveryHandler,
          useValue: { execute: vi.fn() },
        },
        {
          provide: TrendRemixHandler,
          useValue: { execute: vi.fn() },
        },
      ],
    }).compile();

    skillExecutorService = module.get(SkillExecutorService);
  });

  it('executes the representative BYOK fal.ai image path and completes a content run', async () => {
    const result = await skillExecutorService.execute(
      'image-generation',
      {
        brandId,
        brandVoice: 'Bright, direct, product-led',
        organizationId,
        platforms: ['instagram'],
      },
      {
        height: 768,
        model: ImageTaskModel.FAL,
        prompt: 'A polished V1 product screenshot scene',
        width: 1024,
      },
    );

    expect(result.source).toBe('byok');
    expect(result.draft).toEqual(
      expect.objectContaining({
        mediaUrls: ['https://assets.example/v1-smoke.jpg'],
        skillSlug: 'image-generation',
        type: 'image',
      }),
    );

    expect(skillsService.getSkillById).toHaveBeenCalledWith(
      organizationId,
      'image-generation',
    );
    expect(skillsService.assertBrandSkillEnabled).toHaveBeenCalledWith(
      organizationId,
      brandId,
      'image-generation',
    );
    expect(byokProviderFactoryService.resolveProvider).toHaveBeenCalledWith(
      organizationId,
      ByokProvider.FAL,
    );
    expect(falService.generateImage).toHaveBeenCalledWith(
      'fal-ai/flux/dev',
      {
        image_size: { height: 768, width: 1024 },
        prompt: 'A polished V1 product screenshot scene',
      },
      'fal-byok-key',
    );

    expect(contentRunsService.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: brandId,
        input: expect.objectContaining({
          model: ImageTaskModel.FAL,
          prompt: 'A polished V1 product screenshot scene',
        }),
        organization: organizationId,
        skillSlug: 'image-generation',
        source: ContentRunSource.HOSTED,
        status: ContentRunStatus.PENDING,
      }),
    );
    expect(contentRunsService.patchRun).toHaveBeenCalledWith(
      organizationId,
      runId,
      expect.objectContaining({
        status: ContentRunStatus.RUNNING,
      }),
    );
    expect(contentRunsService.patchRun).toHaveBeenCalledWith(
      organizationId,
      runId,
      expect.objectContaining({
        output: expect.objectContaining({
          mediaUrls: ['https://assets.example/v1-smoke.jpg'],
          metadata: expect.objectContaining({
            fallbackUsed: false,
            model: ImageTaskModel.FAL,
            resolvedProvider: ImageTaskModel.FAL,
          }),
        }),
        source: ContentRunSource.BYOK,
        status: ContentRunStatus.COMPLETED,
        variants: [
          expect.objectContaining({
            content:
              'Generated image for prompt: A polished V1 product screenshot scene',
            id: `${runId}-image-generation-1`,
            platform: 'instagram',
            status: 'generated',
            type: 'image',
          }),
        ],
      }),
    );
    expect(replicateService.runModel).not.toHaveBeenCalled();
    expect(leonardoAIService.generateImage).not.toHaveBeenCalled();
  });
});
