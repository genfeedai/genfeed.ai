import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { ReviewablePostsService } from '@server/collections/posts/services/reviewable-posts.service';
import { SkillsService } from '@server/collections/skills/services/skills.service';
import { ContentGatewayService } from '@server/services/content-gateway/content-gateway.service';
import { SkillWorkflowService } from '@server/services/skill-executor/skill-executor.service';

describe('ContentGatewayService', () => {
  let service: ContentGatewayService;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let skillsService: { getEnabledSkillSlugs: ReturnType<typeof vi.fn> };
  let skillWorkflowService: { execute: ReturnType<typeof vi.fn> };
  let reviewablePostsService: {
    createFromSkillExecution: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentGatewayService,
        {
          provide: BrandsService,
          useValue: { findOne: vi.fn().mockResolvedValue({ id: 'brand' }) },
        },
        {
          provide: SkillsService,
          useValue: {
            getEnabledSkillSlugs: vi
              .fn()
              .mockResolvedValue(['content-writing']),
          },
        },
        {
          provide: SkillWorkflowService,
          useValue: {
            execute: vi.fn().mockResolvedValue({
              draft: {
                content: 'hello',
                metadata: {},
                platforms: [],
                skillSlug: 'content-writing',
                type: 'text',
              },
              executionId: 'execution-1',
            }),
          },
        },
        {
          provide: ReviewablePostsService,
          useValue: {
            createFromSkillExecution: vi
              .fn()
              .mockResolvedValue([{ id: 'post-1', description: 'hello' }]),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ContentGatewayService);
    brandsService = module.get(BrandsService);
    skillsService = module.get(SkillsService);
    skillWorkflowService = module.get(SkillWorkflowService);
    reviewablePostsService = module.get(ReviewablePostsService);
  });

  afterEach(() => vi.clearAllMocks());

  it('routes a signal and returns posts with workflow executions', async () => {
    const result = await service.routeSignal({
      brandId: testId('brand'),
      organizationId: testId('org'),
      payload: { skillSlugs: ['content-writing'] },
      type: 'cron',
    });

    expect(brandsService.findOne).toHaveBeenCalled();
    expect(skillsService.getEnabledSkillSlugs).toHaveBeenCalled();
    expect(skillWorkflowService.execute).toHaveBeenCalled();
    expect(
      reviewablePostsService.createFromSkillExecution,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: 'execution-1' }),
    );
    expect(result.executions).toEqual(['execution-1']);
    expect(result.posts).toHaveLength(1);
  });

  it('processes a manual request through the canonical skill workflow', async () => {
    const organizationId = testId('org');
    const brandId = testId('brand');
    const result = await service.processManualRequest(
      organizationId,
      brandId,
      'content-writing',
      { prompt: 'hello' },
      'user-1',
    );

    expect(skillWorkflowService.execute).toHaveBeenCalledWith(
      'content-writing',
      expect.objectContaining({ brandId, organizationId }),
      { prompt: 'hello' },
      'user-1',
    );
    expect(result.executions).toEqual(['execution-1']);
  });

  it('rejects a missing brand before workflow execution', async () => {
    brandsService.findOne.mockResolvedValue(null);
    await expect(
      service.processManualRequest(
        testId('org'),
        testId('brand', 2),
        'content-writing',
      ),
    ).rejects.toThrow();
    expect(skillWorkflowService.execute).not.toHaveBeenCalled();
  });

  it('returns no executions when no skills are enabled', async () => {
    skillsService.getEnabledSkillSlugs.mockResolvedValue([]);
    const result = await service.routeSignal({
      brandId: testId('brand'),
      organizationId: testId('org'),
      payload: {},
      type: 'cron',
    });
    expect(result).toEqual({ executions: [], posts: [] });
    expect(skillWorkflowService.execute).not.toHaveBeenCalled();
  });
});
