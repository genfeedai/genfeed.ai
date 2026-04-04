import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import { SkillExecutorService } from '@api/services/skill-executor/skill-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ContentGatewayService', () => {
  let service: ContentGatewayService;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let skillsService: { getEnabledSkillSlugs: ReturnType<typeof vi.fn> };
  let skillExecutorService: { executeSkill: ReturnType<typeof vi.fn> };
  let contentDraftsService: {
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
          provide: ContentDraftsService,
          useValue: {
            createFromSkillExecution: vi
              .fn()
              .mockResolvedValue([
                { _id: 'draft-1', content: 'hello', type: 'text' },
              ]),
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
    contentDraftsService = module.get(ContentDraftsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('routes a signal and returns drafts/runs', async () => {
    const result = await service.routeSignal({
      brandId: '507f1f77bcf86cd799439011',
      organizationId: '507f1f77bcf86cd799439012',
      payload: { skillSlugs: ['content-writing'] },
      type: 'cron',
    });

    expect(brandsService.findOne).toHaveBeenCalled();
    expect(skillsService.getEnabledSkillSlugs).toHaveBeenCalled();
    expect(skillExecutorService.executeSkill).toHaveBeenCalled();
    expect(contentDraftsService.createFromSkillExecution).toHaveBeenCalled();
    expect(result.runs).toEqual(['run-1']);
    expect(result.drafts).toHaveLength(1);
  });

  it('processes manual request for a specific skill', async () => {
    const result = await service.processManualRequest(
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
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
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439099',
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
    contentDraftsService.createFromSkillExecution
      .mockResolvedValueOnce([{ _id: 'd1' }])
      .mockResolvedValueOnce([{ _id: 'd2' }]);

    const result = await service.routeSignal({
      brandId: '507f1f77bcf86cd799439011',
      organizationId: '507f1f77bcf86cd799439012',
      payload: {},
      type: 'cron',
    });

    expect(result.runs).toEqual(['run-a', 'run-b']);
    expect(result.drafts).toHaveLength(2);
  });

  it('returns empty runs/drafts when no skills are enabled', async () => {
    skillsService.getEnabledSkillSlugs.mockResolvedValue([]);

    const result = await service.routeSignal({
      brandId: '507f1f77bcf86cd799439011',
      organizationId: '507f1f77bcf86cd799439012',
      payload: {},
      type: 'cron',
    });

    expect(result.runs).toEqual([]);
    expect(result.drafts).toEqual([]);
    expect(skillExecutorService.executeSkill).not.toHaveBeenCalled();
  });
});
