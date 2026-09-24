import { BUILT_IN_SKILL_CATALOG } from '@api/collections/skills/constants/skill-validation.constant';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { ContentGeoOptimizerHandler } from '@api/services/skill-executor/handlers/content-geo-optimizer.handler';
import { ContentWritingHandler } from '@api/services/skill-executor/handlers/content-writing.handler';
import { ImageGenerationHandler } from '@api/services/skill-executor/handlers/image-generation.handler';
import { TrendDiscoveryHandler } from '@api/services/skill-executor/handlers/trend-discovery.handler';
import { TrendRemixHandler } from '@api/services/skill-executor/handlers/trend-remix.handler';
import { SkillWorkflowService } from '@api/services/skill-executor/skill-executor.service';
import { Test, type TestingModule } from '@nestjs/testing';

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
  const skillLibrary = {
    authorizeResolved: vi.fn(),
    recordResolution: vi.fn(),
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
    skillLibrary.authorizeResolved.mockResolvedValue({
      excluded: [],
      included: [],
      versions: [],
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
        { provide: SkillLibraryService, useValue: skillLibrary },
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

  it('stores the authorized version on the workflow input before execution', async () => {
    const builtIn = BUILT_IN_SKILL_CATALOG.find(
      (entry) => entry.slug === 'content-writing',
    );
    if (!builtIn) throw new Error('Missing content-writing fixture');
    skillLibrary.authorizeResolved.mockResolvedValue({
      excluded: [],
      included: [
        {
          ...builtIn,
          defaultInstructions: 'version one',
          systemPromptTemplate: 'version one',
        },
      ],
      versions: [
        {
          contentHash: 'hash-v1',
          skillId: builtIn.id,
          skillVersionId: 'sv-1',
        },
      ],
    });
    await service.execute(
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
        inputValues: expect.objectContaining({
          context: expect.objectContaining({
            pinnedSkills: [
              expect.objectContaining({
                contentHash: 'hash-v1',
                slug: 'content-writing',
                versionId: 'sv-1',
              }),
            ],
          }),
        }),
      }),
    );
  });

  it('pins the authorized version onto the workflow input and reuses it', async () => {
    service.onModuleInit();
    const registration = runner.registerAction.mock.calls.find((call) =>
      String(call[0]).includes('content-writing'),
    );
    const action = registration?.[1] as
      | ((request: {
          context: { organizationId: string; userId: string };
          input: {
            context: Record<string, unknown>;
            params: Record<string, unknown>;
          };
        }) => Promise<unknown>)
      | undefined;
    if (!action) throw new Error('content-writing action was not registered');
    skillLibrary.authorizeResolved.mockImplementation(
      async (
        _actor: unknown,
        docs: Array<{ id: string }>,
        pins: Array<{ skillVersionId?: string }>,
      ) => ({
        excluded: [],
        included: docs.map((doc) => ({
          ...doc,
          defaultInstructions: 'version one',
          systemPromptTemplate: 'version one',
        })),
        versions: [
          {
            contentHash: 'hash-v1',
            skillId: String(docs[0]?.id),
            skillVersionId: pins[0]?.skillVersionId ?? 'sv-1',
          },
        ],
      }),
    );
    const context: Record<string, unknown> = {
      brandId: 'brand-1',
      brandVoice: 'Direct',
      organizationId: 'org-1',
      platforms: ['instagram'],
    };
    const request = {
      context: { organizationId: 'org-1', userId: 'user-1' },
      input: { context, params: { topic: 'launch' } },
    };

    await action(request);
    await action(request);

    expect(skills.getSkillById).toHaveBeenCalledWith(
      'org-1',
      'content-writing',
      'user-1',
    );
    expect(context.pinnedSkills).toEqual([
      expect.objectContaining({
        contentHash: 'hash-v1',
        slug: 'content-writing',
        versionId: 'sv-1',
      }),
    ]);
    expect(skillLibrary.authorizeResolved).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      expect.any(Array),
      [
        expect.objectContaining({
          contentHash: 'hash-v1',
          skillVersionId: 'sv-1',
        }),
      ],
    );
    expect(skillLibrary.recordResolution).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      [expect.objectContaining({ skillVersionId: 'sv-1' })],
      [],
    );
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
