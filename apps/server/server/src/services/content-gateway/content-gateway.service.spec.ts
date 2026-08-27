import { BrandsService } from '@server/collections/brands/services/brands.service';
import { ReviewablePostsService } from '@server/collections/posts/services/reviewable-posts.service';
import { SkillsService } from '@server/collections/skills/services/skills.service';
import { ContentGatewayService } from '@server/services/content-gateway/content-gateway.service';
import { SkillExecutorService } from '@server/services/skill-executor/skill-executor.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ContentGatewayService', () => {
  let service: ContentGatewayService;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let skillsService: { getEnabledSkillSlugs: ReturnType<typeof vi.fn> };
  let skillExecutorService: { executeSkill: ReturnType<typeof vi.fn> };
  let reviewablePostsService: {
    createFromSkillExecution: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentGatewayService,
        {
          provide: BrandsService,
          useValue: { findOne: vi.fn().mockResolvedValue({ _id: 'brand' }) },
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
          provide: SkillExecutorService,
          useValue: {
            executeSkill: vi.fn().mockResolvedValue({
              drafts: [{ content: 'hello', type: 'text' }],
              runId: 'run-1',
              skillSlug: 'content-writing',
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
    skillExecutorService = module.get(SkillExecutorService);
    reviewablePostsService = module.get(ReviewablePostsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('routes a signal and returns posts/runs', async () => {
    const result = await service.routeSignal({
      brandId: testId('brand'),
      organizationId: testId('org'),
      payload: { skillSlugs: ['content-writing'] },
      type: 'cron',
    });

    expect(brandsService.findOne).toHaveBeenCalled();
    expect(skillsService.getEnabledSkillSlugs).toHaveBeenCalled();
    expect(skillExecutorService.executeSkill).toHaveBeenCalled();
    expect(reviewablePostsService.createFromSkillExecution).toHaveBeenCalled();
    expect(result.runs).toEqual(['run-1']);
    expect(result.posts).toHaveLength(1);
  });

  it('processes manual request for a specific skill', async () => {
    const result = await service.processManualRequest(
      testId('org'),
      testId('brand'),
      'content-writing',
      { prompt: 'hello' },
    );

    expect(skillExecutorService.executeSkill).toHaveBeenCalledWith(
      expect.objectContaining({ signalType: 'manual' }),
      'content-writing',
      { prompt: 'hello' },
    );
    expect(result.runs).toEqual(['run-1']);
  });

  it('throws NotFoundException when brand does not exist', async () => {
    brandsService.findOne.mockResolvedValue(null);

    await expect(
      service.processManualRequest(
        testId('org'),
        testId('brand', 2),
        'some-skill',
      ),
    ).rejects.toThrow();
  });

  it('runs multiple skills when multiple are enabled', async () => {
    skillsService.getEnabledSkillSlugs.mockResolvedValue([
      'content-writing',
      'video-gen',
    ]);
    skillExecutorService.executeSkill
      .mockResolvedValueOnce({ drafts: [{ content: 'a' }], runId: 'run-a' })
      .mockResolvedValueOnce({ drafts: [{ content: 'b' }], runId: 'run-b' });
    reviewablePostsService.createFromSkillExecution
      .mockResolvedValueOnce([{ id: 'post-1' }])
      .mockResolvedValueOnce([{ id: 'post-2' }]);

    const result = await service.routeSignal({
      brandId: testId('brand'),
      organizationId: testId('org'),
      payload: {},
      type: 'cron',
    });

    expect(result.runs).toEqual(['run-a', 'run-b']);
    expect(result.posts).toHaveLength(2);
  });

  it('returns empty runs/posts when no skills are enabled', async () => {
    skillsService.getEnabledSkillSlugs.mockResolvedValue([]);

    const result = await service.routeSignal({
      brandId: testId('brand'),
      organizationId: testId('org'),
      payload: {},
      type: 'cron',
    });

    expect(result.runs).toEqual([]);
    expect(result.posts).toEqual([]);
    expect(skillExecutorService.executeSkill).not.toHaveBeenCalled();
  });
});
