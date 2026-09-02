import { Test, type TestingModule } from '@nestjs/testing';
import { BUILT_IN_SKILL_CATALOG } from '@server/collections/skills/constants/skill-validation.constant';
import { SkillsService } from '@server/collections/skills/services/skills.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import { ContentGeoOptimizerHandler } from '@server/services/skill-executor/handlers/content-geo-optimizer.handler';
import { ContentWritingHandler } from '@server/services/skill-executor/handlers/content-writing.handler';
import { ImageGenerationHandler } from '@server/services/skill-executor/handlers/image-generation.handler';
import { TrendDiscoveryHandler } from '@server/services/skill-executor/handlers/trend-discovery.handler';
import { TrendRemixHandler } from '@server/services/skill-executor/handlers/trend-remix.handler';
import { SkillWorkflowService } from '@server/services/skill-executor/skill-executor.service';

describe('SkillWorkflowService', () => {
  const handler = { execute: vi.fn() };
  const skills = {
    assertBrandSkillEnabled: vi.fn(),
    getSkillById: vi.fn(),
  };
  const runner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn(),
    runWorkflow: vi.fn(),
  };
  let service: SkillWorkflowService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const builtIn = BUILT_IN_SKILL_CATALOG.find(
      (skill) => skill.slug === 'content-writing',
    );
    if (!builtIn) throw new Error('Missing content-writing fixture');
    skills.getSkillById.mockResolvedValue({
      ...builtIn,
      isEnabled: true,
      status: 'published',
    });
    runner.runWorkflow.mockResolvedValue({
      provenance: { executionId: 'execution-1' },
      result: {
        content: 'Generated content',
        metadata: {},
        platforms: ['instagram'],
        skillSlug: 'content-writing',
        type: 'text',
      },
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillWorkflowService,
        { provide: SkillsService, useValue: skills },
        { provide: SystemWorkflowRunnerService, useValue: runner },
        { provide: ContentGeoOptimizerHandler, useValue: handler },
        { provide: ContentWritingHandler, useValue: handler },
        { provide: ImageGenerationHandler, useValue: handler },
        { provide: TrendDiscoveryHandler, useValue: handler },
        { provide: TrendRemixHandler, useValue: handler },
      ],
    }).compile();
    service = module.get(SkillWorkflowService);
  });

  it('registers every exact skill action and immutable workflow', () => {
    service.onModuleInit();
    expect(runner.registerAction).toHaveBeenCalledTimes(5);
    expect(runner.registerWorkflow).toHaveBeenCalledTimes(5);
  });

  it('runs the selected canonical workflow and returns its provenance', async () => {
    const result = await service.execute(
      'content-writing',
      {
        brandId: 'brand-1',
        brandVoice: 'Direct',
        organizationId: 'org-1',
        platforms: ['instagram'],
      },
      { topic: 'launch' },
      'user-1',
    );
    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'skill.content-writing',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(result).toMatchObject({ executionId: 'execution-1' });
  });

  it('rejects a slug outside the reviewed action catalog', async () => {
    await expect(
      service.execute('custom-skill', {
        brandId: 'brand-1',
        brandVoice: '',
        organizationId: 'org-1',
        platforms: [],
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(runner.runWorkflow).not.toHaveBeenCalled();
  });
});
