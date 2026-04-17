import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type ContentDraft } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ContentDraftsService', () => {
  let service: ContentDraftsService;
  let model: {
    create: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let trendReferenceCorpusService: {
    recordDraftRemixLineage: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const modelMock = {
      create: vi.fn().mockResolvedValue({ _id: 'draft-1' }),
      findOneAndUpdate: vi
        .fn()
        .mockResolvedValue({ _id: 'draft-1', status: 'approved' }),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 2 }),
    };
    const trendReferenceCorpusServiceMock = {
      recordDraftRemixLineage: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentDraftsService,
        { provide: PrismaService, useValue: modelMock },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: TrendReferenceCorpusService,
          useValue: trendReferenceCorpusServiceMock,
        },
      ],
    }).compile();

    service = module.get(ContentDraftsService);
    model = module.get(PrismaService);
    trendReferenceCorpusService = module.get(TrendReferenceCorpusService);
  });

  it('creates drafts from skill execution output', async () => {
    const result = await service.createFromSkillExecution(
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
      'content-writing',
      '507f1f77bcf86cd799439010',
      [{ content: 'hello', type: 'text' }],
    );

    expect(model.create).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('records remix lineage when draft metadata includes reference ids', async () => {
    await service.createFromSkillExecution(
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
      'content-writing',
      '507f1f77bcf86cd799439010',
      [
        {
          content: 'hello',
          metadata: {
            sourceReferenceIds: ['507f1f77bcf86cd799439099'],
            trendIds: ['507f1f77bcf86cd799439098'],
          },
          platforms: ['twitter'],
          type: 'text',
        },
      ],
    );

    expect(
      trendReferenceCorpusService.recordDraftRemixLineage,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: '507f1f77bcf86cd799439011',
        organizationId: '507f1f77bcf86cd799439012',
        platforms: ['twitter'],
      }),
    );
  });

  it('approves a draft', async () => {
    const result = await service.approve(
      '507f1f77bcf86cd799439010',
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
    );

    expect(model.findOneAndUpdate).toHaveBeenCalled();
    expect(result.status).toBe('approved');
  });

  it('bulk approves drafts', async () => {
    const result = await service.bulkApprove(
      ['507f1f77bcf86cd799439010', '507f1f77bcf86cd799439013'],
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439011',
    );

    expect(model.updateMany).toHaveBeenCalled();
    expect(result.modifiedCount).toBe(2);
  });
});
