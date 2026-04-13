import { BrandsService } from '@api/collections/brands/services/brands.service';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { PostAnalytics } from '@api/collections/posts/schemas/post-analytics.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { REVIEW_BATCH_ITEM_FORMATS } from '@api/services/batch-generation/constants/review-batch-item-format.constant';
import type { CreateBatchDto } from '@api/services/batch-generation/dto/create-batch.dto';
import {
  Batch,
  type BatchDocument,
} from '@api/services/batch-generation/schemas/batch.schema';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  PostStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('BatchGenerationService', () => {
  let service: BatchGenerationService;
  let batchModel: Record<string, vi.Mock>;
  let postModel: {
    find: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };
  let postAnalyticsModel: {
    aggregate: ReturnType<typeof vi.fn>;
  };
  let brandsService: vi.Mocked<Pick<BrandsService, 'findOne'>>;
  let postsService: vi.Mocked<Pick<PostsService, 'create'>>;
  let contentGeneratorService: vi.Mocked<
    Pick<ContentGeneratorService, 'generateContent'>
  >;
  let loggerService: vi.Mocked<LoggerService>;

  const orgId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();

  const createDto: CreateBatchDto = {
    brandId,
    count: 5,
    dateRange: { end: '2024-02-01', start: '2024-01-01' },
    platforms: ['instagram', 'twitter'],
    topics: ['AI', 'Technology'],
  };

  const createMockBatch = (
    overrides: Record<string, unknown> = {},
  ): Partial<BatchDocument> => {
    const batchId = new Types.ObjectId();
    return {
      _id: batchId,
      brand: new Types.ObjectId(brandId),
      completedAt: undefined,
      completedCount: 0,
      contentMix: {
        carouselPercent: 10,
        imagePercent: 60,
        reelPercent: 5,
        storyPercent: 0,
        videoPercent: 25,
      },
      createdAt: new Date(),
      dateRangeEnd: new Date('2024-02-01'),
      dateRangeStart: new Date('2024-01-01'),
      failedCount: 0,
      isDeleted: false,
      items: [
        {
          _id: new Types.ObjectId().toString(),
          format: ContentFormat.IMAGE,
          platform: 'instagram',
          scheduledDate: new Date('2024-01-08'),
          status: BatchItemStatus.PENDING,
        },
        {
          _id: new Types.ObjectId().toString(),
          format: ContentFormat.VIDEO,
          platform: 'twitter',
          scheduledDate: new Date('2024-01-15'),
          status: BatchItemStatus.PENDING,
        },
      ],
      organization: new Types.ObjectId(orgId),
      platforms: ['instagram', 'twitter'],
      save: vi.fn().mockResolvedValue(undefined),
      status: BatchStatus.PENDING,
      style: undefined,
      topics: ['AI', 'Technology'],
      totalCount: 5,
      user: new Types.ObjectId(userId),
      ...overrides,
    } as unknown as Partial<BatchDocument>;
  };

  beforeEach(async () => {
    const mockBatchModel = {
      countDocuments: vi.fn(),
      create: vi.fn(),
      find: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      }),
      findOne: vi.fn(),
    };
    postModel = {
      find: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    postAnalyticsModel = {
      aggregate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      }),
    };
    Object.defineProperty(mockBatchModel, 'db', {
      configurable: true,
      value: {
        model: vi.fn().mockReturnValue(postModel),
      },
    });

    const mockBrandsService = {
      findOne: vi.fn(),
    };

    const mockPostsService = {
      create: vi.fn(),
    };

    const mockContentGeneratorService = {
      generateContent: vi.fn(),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchGenerationService,
        {
          provide: getModelToken(Batch.name, DB_CONNECTIONS.CLOUD),
          useValue: mockBatchModel,
        },
        {
          provide: getModelToken(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS),
          useValue: postAnalyticsModel,
        },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: PostsService, useValue: mockPostsService },
        {
          provide: ContentGeneratorService,
          useValue: mockContentGeneratorService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<BatchGenerationService>(BatchGenerationService);
    batchModel = module.get(getModelToken(Batch.name, DB_CONNECTIONS.CLOUD));
    brandsService = module.get(BrandsService);
    postsService = module.get(PostsService);
    contentGeneratorService = module.get(ContentGeneratorService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createBatch', () => {
    it('should create a batch successfully', async () => {
      const mockBrand = {
        _id: new Types.ObjectId(brandId),
        name: 'Test Brand',
      };

      brandsService.findOne.mockResolvedValue(mockBrand as never);

      const mockBatch = createMockBatch();
      batchModel.create.mockResolvedValue(mockBatch);

      const result = await service.createBatch(createDto, userId, orgId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockBatch._id!.toString());
      expect(result.status).toBe(BatchStatus.PENDING);
      expect(result.brandId).toBe(brandId);
      expect(brandsService.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
      });
      expect(batchModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: new Types.ObjectId(brandId),
          organization: new Types.ObjectId(orgId),
          platforms: ['instagram', 'twitter'],
          status: BatchStatus.PENDING,
          totalCount: 5,
          user: new Types.ObjectId(userId),
        }),
      );
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should throw NotFoundException when brand is not found', async () => {
      brandsService.findOne.mockResolvedValue(null as never);

      await expect(
        service.createBatch(createDto, userId, orgId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use default contentMix when not provided', async () => {
      const dtoWithoutMix: CreateBatchDto = {
        ...createDto,
        contentMix: undefined,
      };

      const mockBrand = { _id: new Types.ObjectId(brandId), name: 'Brand' };
      brandsService.findOne.mockResolvedValue(mockBrand as never);

      const mockBatch = createMockBatch();
      batchModel.create.mockResolvedValue(mockBatch);

      await service.createBatch(dtoWithoutMix, userId, orgId);

      expect(batchModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contentMix: {
            carouselPercent: 10,
            imagePercent: 60,
            reelPercent: 5,
            storyPercent: 0,
            videoPercent: 25,
          },
        }),
      );
    });

    it('should use custom contentMix when provided', async () => {
      const dtoWithCustomMix: CreateBatchDto = {
        ...createDto,
        contentMix: {
          carouselPercent: 0,
          imagePercent: 50,
          reelPercent: 0,
          storyPercent: 0,
          videoPercent: 50,
        },
      };

      const mockBrand = { _id: new Types.ObjectId(brandId), name: 'Brand' };
      brandsService.findOne.mockResolvedValue(mockBrand as never);

      const mockBatch = createMockBatch({
        contentMix: dtoWithCustomMix.contentMix,
      });
      batchModel.create.mockResolvedValue(mockBatch);

      await service.createBatch(dtoWithCustomMix, userId, orgId);

      expect(batchModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contentMix: dtoWithCustomMix.contentMix,
        }),
      );
    });

    it('should default topics to empty array when not provided', async () => {
      const dtoWithoutTopics: CreateBatchDto = {
        ...createDto,
        topics: undefined,
      };

      const mockBrand = { _id: new Types.ObjectId(brandId), name: 'Brand' };
      brandsService.findOne.mockResolvedValue(mockBrand as never);

      const mockBatch = createMockBatch({ topics: [] });
      batchModel.create.mockResolvedValue(mockBatch);

      await service.createBatch(dtoWithoutTopics, userId, orgId);

      expect(batchModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          topics: [],
        }),
      );
    });
  });

  describe('createManualReviewBatch', () => {
    it('should create draft posts and a completed manual review batch', async () => {
      const mockBrand = {
        _id: new Types.ObjectId(brandId),
        name: 'Test Brand',
      };
      const ingredientId = new Types.ObjectId().toString();
      const postId = new Types.ObjectId();
      const batchId = new Types.ObjectId();
      const contentRunId = new Types.ObjectId().toString();

      brandsService.findOne.mockResolvedValue(mockBrand as never);
      postsService.create.mockResolvedValue({ _id: postId } as never);
      batchModel.create.mockResolvedValue(
        createMockBatch({
          _id: batchId,
          completedAt: new Date(),
          completedCount: 1,
          contentMix: {
            carouselPercent: 0,
            imagePercent: 0,
            reelPercent: 0,
            storyPercent: 0,
            videoPercent: 0,
          },
          items: [
            {
              _id: new Types.ObjectId().toString(),
              caption: 'Review this launch clip',
              contentRunId: new Types.ObjectId(contentRunId),
              creativeVersion: 'creative-a',
              format: ContentFormat.VIDEO,
              hookVersion: 'hook-a',
              platform: 'instagram',
              postId,
              publishIntent: 'campaign-test',
              prompt: 'Review this launch clip',
              scheduleSlot: 'morning',
              status: BatchItemStatus.COMPLETED,
              variantId: 'variant-a',
            },
          ],
          platforms: ['instagram'],
          status: BatchStatus.COMPLETED,
          totalCount: 1,
        }),
      );

      const result = await service.createManualReviewBatch(
        {
          brandId,
          items: [
            {
              caption: 'Review this launch clip',
              contentRunId,
              creativeVersion: 'creative-a',
              format: ContentFormat.VIDEO,
              gateOverallScore: 87,
              gateReasons: ['Draft cleared the autopilot quality gate.'],
              hookVersion: 'hook-a',
              ingredientId,
              label: 'Launch clip',
              opportunitySourceType: 'event',
              opportunityTopic: 'Launch clip topic',
              platform: 'instagram',
              publishIntent: 'campaign-test',
              prompt: 'Review this launch clip',
              scheduleSlot: 'morning',
              sourceActionId: 'opp-1',
              sourceWorkflowId: 'strategy-1',
              variantId: 'variant-a',
            },
          ],
        },
        userId,
        orgId,
      );

      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: new Types.ObjectId(brandId),
          contentRunId: new Types.ObjectId(contentRunId),
          creativeVersion: 'creative-a',
          description: 'Review this launch clip',
          hookVersion: 'hook-a',
          ingredients: [new Types.ObjectId(ingredientId)],
          label: 'Launch clip',
          organization: new Types.ObjectId(orgId),
          platform: 'instagram',
          publishIntent: 'campaign-test',
          scheduleSlot: 'morning',
          status: PostStatus.DRAFT,
          user: new Types.ObjectId(userId),
          variantId: 'variant-a',
        }),
      );
      expect(batchModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: new Types.ObjectId(brandId),
          completedCount: 1,
          items: [
            expect.objectContaining({
              contentRunId: new Types.ObjectId(contentRunId),
              creativeVersion: 'creative-a',
              gateOverallScore: 87,
              gateReasons: ['Draft cleared the autopilot quality gate.'],
              hookVersion: 'hook-a',
              opportunitySourceType: 'event',
              opportunityTopic: 'Launch clip topic',
              publishIntent: 'campaign-test',
              scheduleSlot: 'morning',
              sourceActionId: 'opp-1',
              sourceWorkflowId: 'strategy-1',
              variantId: 'variant-a',
            }),
          ],
          platforms: ['instagram'],
          source: 'manual',
          status: BatchStatus.COMPLETED,
          totalCount: 1,
        }),
      );
      expect(postModel.updateOne).toHaveBeenCalled();
      expect(result.id).toBe(batchId.toString());
    });

    it('should throw when the manual review batch brand does not exist', async () => {
      brandsService.findOne.mockResolvedValue(null as never);

      await expect(
        service.createManualReviewBatch(
          {
            brandId,
            items: [{ format: ContentFormat.VIDEO }],
          },
          userId,
          orgId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('accepts post review items for non-visual publishing inbox handoff', async () => {
      const mockBrand = {
        _id: new Types.ObjectId(brandId),
        name: 'Test Brand',
      };
      const postId = new Types.ObjectId();
      const batchId = new Types.ObjectId();

      brandsService.findOne.mockResolvedValue(mockBrand as never);
      postsService.create.mockResolvedValue({ _id: postId } as never);
      batchModel.create.mockResolvedValue(
        createMockBatch({
          _id: batchId,
          completedAt: new Date(),
          completedCount: 1,
          items: [
            {
              _id: new Types.ObjectId().toString(),
              caption: 'Review this thread draft',
              format: 'post',
              platform: 'twitter',
              postId,
              prompt: 'Review this thread draft',
              status: BatchItemStatus.COMPLETED,
            },
          ],
          platforms: ['twitter'],
          status: BatchStatus.COMPLETED,
          totalCount: 1,
        }),
      );

      await service.createManualReviewBatch(
        {
          brandId,
          items: [
            {
              caption: 'Review this thread draft',
              format: 'post',
              label: 'AI thread draft',
              platform: 'twitter',
            },
          ],
        },
        userId,
        orgId,
      );

      expect(REVIEW_BATCH_ITEM_FORMATS).toContain('post');
      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'AI thread draft',
          platform: 'twitter',
          status: PostStatus.DRAFT,
        }),
      );
    });
  });

  describe('processBatch', () => {
    it('should process all pending items successfully', async () => {
      const mockBatch = createMockBatch();
      batchModel.findOne.mockResolvedValue(mockBatch);

      contentGeneratorService.generateContent.mockResolvedValue([
        { content: 'Generated content' },
      ] as never);

      const mockPostId = new Types.ObjectId();
      postsService.create.mockResolvedValue({ _id: mockPostId } as never);

      const result = await service.processBatch(
        mockBatch._id!.toString(),
        orgId,
      );

      expect(result).toBeDefined();
      expect(mockBatch.save).toHaveBeenCalled();
      expect(contentGeneratorService.generateContent).toHaveBeenCalled();
      expect(postsService.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when batch is not found', async () => {
      batchModel.findOne.mockResolvedValue(null);

      await expect(
        service.processBatch(new Types.ObjectId().toString(), orgId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should skip non-pending items', async () => {
      const mockBatch = createMockBatch({
        items: [
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            status: BatchItemStatus.COMPLETED,
          },
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.VIDEO,
            platform: 'twitter',
            status: BatchItemStatus.PENDING,
          },
        ],
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      contentGeneratorService.generateContent.mockResolvedValue([
        { content: 'Content' },
      ] as never);
      postsService.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      } as never);

      await service.processBatch(mockBatch._id!.toString(), orgId);

      // Only 1 call for the pending item
      expect(contentGeneratorService.generateContent).toHaveBeenCalledTimes(1);
    });

    it('should handle item generation failure gracefully', async () => {
      const mockBatch = createMockBatch({
        items: [
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            status: BatchItemStatus.PENDING,
          },
        ],
        totalCount: 1,
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      contentGeneratorService.generateContent.mockRejectedValue(
        new Error('Generation failed'),
      );

      const result = await service.processBatch(
        mockBatch._id!.toString(),
        orgId,
      );

      expect(result).toBeDefined();
      const items = mockBatch.items as Array<{
        status: BatchItemStatus;
        error?: string;
      }>;
      expect(items[0].status).toBe(BatchItemStatus.FAILED);
      expect(items[0].error).toBe('Generation failed');
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should set batch status to COMPLETED when all items succeed', async () => {
      const mockBatch = createMockBatch({
        items: [
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            status: BatchItemStatus.PENDING,
          },
        ],
        totalCount: 1,
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      contentGeneratorService.generateContent.mockResolvedValue([
        { content: 'Content' },
      ] as never);
      postsService.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      } as never);

      await service.processBatch(mockBatch._id!.toString(), orgId);

      expect(mockBatch.status).toBe(BatchStatus.COMPLETED);
      expect(mockBatch.completedAt).toBeDefined();
    });

    it('should set batch status to PARTIAL when some items fail', async () => {
      const mockBatch = createMockBatch({
        items: [
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            status: BatchItemStatus.PENDING,
          },
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.VIDEO,
            platform: 'twitter',
            status: BatchItemStatus.PENDING,
          },
        ],
        totalCount: 2,
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      contentGeneratorService.generateContent
        .mockResolvedValueOnce([{ content: 'Content' }] as never)
        .mockRejectedValueOnce(new Error('Failed'));

      postsService.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      } as never);

      await service.processBatch(mockBatch._id!.toString(), orgId);

      expect(mockBatch.status).toBe(BatchStatus.PARTIAL);
    });

    it('should set batch status to FAILED when all items fail', async () => {
      const mockBatch = createMockBatch({
        items: [
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            status: BatchItemStatus.PENDING,
          },
        ],
        totalCount: 1,
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      contentGeneratorService.generateContent.mockRejectedValue(
        new Error('All failed'),
      );

      await service.processBatch(mockBatch._id!.toString(), orgId);

      expect(mockBatch.status).toBe(BatchStatus.FAILED);
    });

    it('should set status to GENERATING before processing', async () => {
      const mockBatch = createMockBatch({
        items: [],
        totalCount: 0,
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      await service.processBatch(mockBatch._id!.toString(), orgId);

      // save is called first with GENERATING status, then again after processing
      expect(mockBatch.save).toHaveBeenCalled();
    });

    it('should cycle through topics for each item', async () => {
      const mockBatch = createMockBatch({
        items: [
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            status: BatchItemStatus.PENDING,
          },
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.VIDEO,
            platform: 'twitter',
            status: BatchItemStatus.PENDING,
          },
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            status: BatchItemStatus.PENDING,
          },
        ],
        topics: ['AI', 'Tech'],
        totalCount: 3,
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      contentGeneratorService.generateContent.mockResolvedValue([
        { content: 'Content' },
      ] as never);
      postsService.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      } as never);

      await service.processBatch(mockBatch._id!.toString(), orgId);

      // Should cycle: AI, Tech, AI
      expect(contentGeneratorService.generateContent).toHaveBeenCalledTimes(3);
      const calls = contentGeneratorService.generateContent.mock.calls;
      expect(calls[0][1]).toEqual(expect.objectContaining({ topic: 'AI' }));
      expect(calls[1][1]).toEqual(expect.objectContaining({ topic: 'Tech' }));
      expect(calls[2][1]).toEqual(expect.objectContaining({ topic: 'AI' }));
    });

    it('should use format as topic fallback when no topics provided', async () => {
      const mockBatch = createMockBatch({
        items: [
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            status: BatchItemStatus.PENDING,
          },
        ],
        topics: [],
        totalCount: 1,
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      contentGeneratorService.generateContent.mockResolvedValue([
        { content: 'Content' },
      ] as never);
      postsService.create.mockResolvedValue({
        _id: new Types.ObjectId(),
      } as never);

      await service.processBatch(mockBatch._id!.toString(), orgId);

      expect(contentGeneratorService.generateContent).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        expect.objectContaining({ topic: 'image content' }),
      );
    });
  });

  describe('getBatch', () => {
    it('should return batch summary when found', async () => {
      const mockBatch = createMockBatch();
      batchModel.findOne.mockResolvedValue(mockBatch);

      const result = await service.getBatch(mockBatch._id!.toString(), orgId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockBatch._id!.toString());
      expect(result.status).toBe(BatchStatus.PENDING);
    });

    it('should enrich batch items with analytics snapshots from linked posts', async () => {
      const postId = new Types.ObjectId();
      const mockBatch = createMockBatch({
        items: [
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.VIDEO,
            platform: 'instagram',
            postId,
            reviewEvents: [],
            status: BatchItemStatus.COMPLETED,
          },
        ],
      });
      batchModel.findOne.mockResolvedValue(mockBatch);
      postModel.find.mockResolvedValue([
        {
          _id: postId,
          generationId: 'gen-1',
          promptUsed: 'Write a launch reel',
          status: PostStatus.PUBLIC,
        },
      ]);
      postAnalyticsModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: postId,
            avgEngagementRate: 7.5,
            totalComments: 12,
            totalLikes: 220,
            totalSaves: 18,
            totalShares: 9,
            totalViews: 5400,
          },
        ]),
      });

      const result = await service.getBatch(mockBatch._id!.toString(), orgId);

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          postAvgEngagementRate: 7.5,
          postGenerationId: 'gen-1',
          postPromptUsed: 'Write a launch reel',
          postStatus: PostStatus.PUBLIC,
          postTotalComments: 12,
          postTotalLikes: 220,
          postTotalSaves: 18,
          postTotalShares: 9,
          postTotalViews: 5400,
        }),
      );
    });

    it('should throw NotFoundException when batch is not found', async () => {
      batchModel.findOne.mockResolvedValue(null);

      await expect(
        service.getBatch(new Types.ObjectId().toString(), orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBatches', () => {
    it('should return paginated batch list', async () => {
      const mockBatch1 = createMockBatch();
      const mockBatch2 = createMockBatch({ status: BatchStatus.COMPLETED });

      const chainedQuery = {
        exec: vi.fn().mockResolvedValue([mockBatch1, mockBatch2]),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };

      batchModel.find.mockReturnValue(chainedQuery);
      batchModel.countDocuments.mockResolvedValue(2);

      const result = await service.getBatches(orgId);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(chainedQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should apply status filter when provided', async () => {
      const chainedQuery = {
        exec: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };

      batchModel.find.mockReturnValue(chainedQuery);
      batchModel.countDocuments.mockResolvedValue(0);

      await service.getBatches(orgId, { status: BatchStatus.COMPLETED });

      expect(batchModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BatchStatus.COMPLETED,
        }),
      );
    });

    it('should cap limit at 100', async () => {
      const chainedQuery = {
        exec: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };

      batchModel.find.mockReturnValue(chainedQuery);
      batchModel.countDocuments.mockResolvedValue(0);

      await service.getBatches(orgId, { limit: 500 });

      expect(chainedQuery.limit).toHaveBeenCalledWith(100);
    });

    it('should use default limit of 20 and offset of 0', async () => {
      const chainedQuery = {
        exec: vi.fn().mockResolvedValue([]),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      };

      batchModel.find.mockReturnValue(chainedQuery);
      batchModel.countDocuments.mockResolvedValue(0);

      await service.getBatches(orgId);

      expect(chainedQuery.limit).toHaveBeenCalledWith(20);
      expect(chainedQuery.skip).toHaveBeenCalledWith(0);
    });
  });

  describe('approveItems', () => {
    it('should approve completed items and schedule posts', async () => {
      const itemId = new Types.ObjectId().toString();
      const postId = new Types.ObjectId();
      const mockBatch = createMockBatch({
        items: [
          {
            _id: itemId,
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            postId,
            scheduledDate: new Date('2024-01-08'),
            status: BatchItemStatus.COMPLETED,
          },
        ],
      });

      const mockUpdateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
      (mockBatch as Record<string, unknown>).save = vi
        .fn()
        .mockResolvedValue(undefined);

      batchModel.findOne.mockResolvedValue(mockBatch);

      // Mock db.model chain
      const dbMock = {
        model: vi.fn().mockReturnValue({
          find: vi.fn().mockResolvedValue([]),
          updateMany: mockUpdateMany,
        }),
      };
      Object.defineProperty(batchModel, 'db', {
        configurable: true,
        value: dbMock,
      });

      const result = await service.approveItems(
        mockBatch._id!.toString(),
        [itemId],
        orgId,
      );

      expect(result).toBeDefined();
      const items = mockBatch.items as Array<{
        reviewDecision?: string;
        reviewEvents?: Array<{ decision: string }>;
        reviewedAt?: Date;
      }>;
      expect(items[0].reviewDecision).toBe('approved');
      expect(items[0].reviewEvents).toEqual([
        expect.objectContaining({ decision: 'approved' }),
      ]);
      expect(items[0].reviewedAt).toBeInstanceOf(Date);
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: [postId] },
        }),
        expect.objectContaining({
          $push: expect.objectContaining({
            reviewEvents: expect.objectContaining({
              decision: 'approved',
              reviewedAt: expect.any(Date),
            }),
          }),
          $set: expect.objectContaining({
            reviewDecision: 'approved',
            reviewedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: [postId] },
        }),
        { $set: { status: PostStatus.SCHEDULED } },
      );
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should keep unscheduled draft review posts in draft state', async () => {
      const itemId = new Types.ObjectId().toString();
      const postId = new Types.ObjectId();
      const mockBatch = createMockBatch({
        items: [
          {
            _id: itemId,
            format: ContentFormat.VIDEO,
            platform: 'instagram',
            postId,
            status: BatchItemStatus.COMPLETED,
          },
        ],
      });
      const mockUpdateMany = vi.fn().mockResolvedValue({ modifiedCount: 0 });

      (mockBatch as Record<string, unknown>).save = vi
        .fn()
        .mockResolvedValue(undefined);
      batchModel.findOne.mockResolvedValue(mockBatch);

      Object.defineProperty(batchModel, 'db', {
        configurable: true,
        value: {
          model: vi.fn().mockReturnValue({
            find: vi.fn().mockResolvedValue([]),
            updateMany: mockUpdateMany,
          }),
        },
      });

      const result = await service.approveItems(
        mockBatch._id!.toString(),
        [itemId],
        orgId,
      );

      expect(result).toBeDefined();
      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: [postId] },
        }),
        expect.objectContaining({
          $push: expect.objectContaining({
            reviewEvents: expect.objectContaining({
              decision: 'approved',
              reviewedAt: expect.any(Date),
            }),
          }),
          $set: expect.objectContaining({
            reviewDecision: 'approved',
            reviewedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw NotFoundException when batch is not found', async () => {
      batchModel.findOne.mockResolvedValue(null);

      await expect(
        service.approveItems(
          new Types.ObjectId().toString(),
          ['item-id'],
          orgId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not schedule posts for non-completed items', async () => {
      const itemId = new Types.ObjectId().toString();
      const postId = new Types.ObjectId();
      const mockBatch = createMockBatch({
        items: [
          {
            _id: itemId,
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            postId,
            status: BatchItemStatus.PENDING, // Not COMPLETED
          },
        ],
      });

      batchModel.findOne.mockResolvedValue(mockBatch);
      (mockBatch as Record<string, unknown>).save = vi
        .fn()
        .mockResolvedValue(undefined);

      const result = await service.approveItems(
        mockBatch._id!.toString(),
        [itemId],
        orgId,
      );

      // No updateMany should be called since no items qualify
      expect(result).toBeDefined();
    });
  });

  describe('rejectItems', () => {
    it('should reject items and soft-delete posts', async () => {
      const itemId = new Types.ObjectId().toString();
      const postId = new Types.ObjectId();
      const mockBatch = createMockBatch({
        items: [
          {
            _id: itemId,
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            postId,
            status: BatchItemStatus.COMPLETED,
          },
        ],
      });

      const mockUpdateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
      (mockBatch as Record<string, unknown>).save = vi
        .fn()
        .mockResolvedValue(undefined);

      batchModel.findOne.mockResolvedValue(mockBatch);

      const dbMock = {
        model: vi.fn().mockReturnValue({
          find: vi.fn().mockResolvedValue([]),
          updateMany: mockUpdateMany,
        }),
      };
      Object.defineProperty(batchModel, 'db', {
        configurable: true,
        value: dbMock,
      });

      const result = await service.rejectItems(
        mockBatch._id!.toString(),
        [itemId],
        orgId,
        'Off-brand and too generic.',
      );

      expect(result).toBeDefined();
      const items = mockBatch.items as Array<{
        status: BatchItemStatus;
        reviewDecision?: string;
        reviewFeedback?: string;
        reviewEvents?: Array<{ decision: string; feedback?: string }>;
      }>;
      expect(items[0].status).toBe(BatchItemStatus.SKIPPED);
      expect(items[0].reviewDecision).toBe('rejected');
      expect(items[0].reviewFeedback).toBe('Off-brand and too generic.');
      expect(items[0].reviewEvents).toEqual([
        expect.objectContaining({
          decision: 'rejected',
          feedback: 'Off-brand and too generic.',
        }),
      ]);
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: [postId] },
        }),
        {
          $push: expect.objectContaining({
            reviewEvents: expect.objectContaining({
              decision: 'rejected',
              feedback: 'Off-brand and too generic.',
              reviewedAt: expect.any(Date),
            }),
          }),
          $set: expect.objectContaining({
            isDeleted: true,
            reviewDecision: 'rejected',
            reviewedAt: expect.any(Date),
            reviewFeedback: 'Off-brand and too generic.',
          }),
        },
      );
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should throw NotFoundException when batch is not found', async () => {
      batchModel.findOne.mockResolvedValue(null);

      await expect(
        service.rejectItems(
          new Types.ObjectId().toString(),
          ['item-id'],
          orgId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestChanges', () => {
    it('should persist request_changes feedback and keep linked posts in draft', async () => {
      const itemId = new Types.ObjectId().toString();
      const postId = new Types.ObjectId();
      const mockBatch = createMockBatch({
        items: [
          {
            _id: itemId,
            format: ContentFormat.VIDEO,
            platform: 'instagram',
            postId,
            status: BatchItemStatus.COMPLETED,
          },
        ],
      });
      const mockUpdateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });

      (mockBatch as Record<string, unknown>).save = vi
        .fn()
        .mockResolvedValue(undefined);
      batchModel.findOne.mockResolvedValue(mockBatch);
      Object.defineProperty(batchModel, 'db', {
        configurable: true,
        value: {
          model: vi.fn().mockReturnValue({
            find: vi.fn().mockResolvedValue([]),
            updateMany: mockUpdateMany,
          }),
        },
      });

      const result = await service.requestChanges(
        mockBatch._id!.toString(),
        [itemId],
        orgId,
        'Need a stronger opening and fewer hashtags.',
      );

      expect(result).toBeDefined();
      const items = mockBatch.items as Array<{
        reviewDecision?: string;
        reviewFeedback?: string;
        reviewEvents?: Array<{ decision: string; feedback?: string }>;
      }>;
      expect(items[0].reviewDecision).toBe('request_changes');
      expect(items[0].reviewFeedback).toBe(
        'Need a stronger opening and fewer hashtags.',
      );
      expect(items[0].reviewEvents).toEqual([
        expect.objectContaining({
          decision: 'request_changes',
          feedback: 'Need a stronger opening and fewer hashtags.',
        }),
      ]);
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $in: [postId] },
        }),
        {
          $push: expect.objectContaining({
            reviewEvents: expect.objectContaining({
              decision: 'request_changes',
              feedback: 'Need a stronger opening and fewer hashtags.',
              reviewedAt: expect.any(Date),
            }),
          }),
          $set: expect.objectContaining({
            reviewDecision: 'request_changes',
            reviewedAt: expect.any(Date),
            reviewFeedback: 'Need a stronger opening and fewer hashtags.',
            status: PostStatus.DRAFT,
          }),
        },
      );
    });

    it('should throw NotFoundException when requestChanges batch is not found', async () => {
      batchModel.findOne.mockResolvedValue(null);

      await expect(
        service.requestChanges(
          new Types.ObjectId().toString(),
          ['item-id'],
          orgId,
          'Missing proof point.',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelBatch', () => {
    it('should cancel pending items and set batch status to CANCELLED', async () => {
      const mockBatch = createMockBatch({
        items: [
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            platform: 'instagram',
            status: BatchItemStatus.PENDING,
          },
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.VIDEO,
            platform: 'twitter',
            status: BatchItemStatus.COMPLETED,
          },
        ],
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      const result = await service.cancelBatch(
        mockBatch._id!.toString(),
        orgId,
      );

      expect(result).toBeDefined();
      expect(mockBatch.status).toBe(BatchStatus.CANCELLED);
      const items = mockBatch.items as Array<{ status: BatchItemStatus }>;
      expect(items[0].status).toBe(BatchItemStatus.SKIPPED); // Was PENDING → SKIPPED
      expect(items[1].status).toBe(BatchItemStatus.COMPLETED); // Stays COMPLETED
      expect(mockBatch.save).toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should throw NotFoundException when batch is not found', async () => {
      batchModel.findOne.mockResolvedValue(null);

      await expect(
        service.cancelBatch(new Types.ObjectId().toString(), orgId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toBatchSummary (via getBatch)', () => {
    it('should correctly map batch to summary format', async () => {
      const completedAt = new Date('2024-01-15');
      const createdAt = new Date('2024-01-01');
      const itemId = new Types.ObjectId().toString();
      const postId = new Types.ObjectId();

      const mockBatch = createMockBatch({
        completedAt,
        completedCount: 1,
        createdAt,
        failedCount: 0,
        items: [
          {
            _id: itemId,
            caption: 'Test caption',
            createdAt: new Date('2024-01-02'),
            error: undefined,
            format: ContentFormat.IMAGE,
            gateOverallScore: 92,
            gateReasons: ['Image cleared the autopilot quality gate.'],
            mediaUrl: 'https://cdn.example.com/image.jpg',
            opportunitySourceType: 'trend',
            opportunityTopic: 'AI launch hooks',
            platform: 'instagram',
            postId,
            prompt: 'Test prompt',
            scheduledDate: new Date('2024-01-10'),
            status: BatchItemStatus.COMPLETED,
          },
        ],
        totalCount: 1,
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      const result = await service.getBatch(mockBatch._id!.toString(), orgId);

      expect(result.id).toBe(mockBatch._id!.toString());
      expect(result.brandId).toBe(brandId);
      expect(result.completedAt).toBe(completedAt.toISOString());
      expect(result.completedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.totalCount).toBe(1);
      expect(result.platforms).toEqual(['instagram', 'twitter']);
      expect(result.contentMix).toEqual({
        carouselPercent: 10,
        imagePercent: 60,
        reelPercent: 5,
        storyPercent: 0,
        videoPercent: 25,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          batchId: mockBatch._id!.toString(),
          caption: 'Test caption',
          format: ContentFormat.IMAGE,
          gateOverallScore: 92,
          gateReasons: ['Image cleared the autopilot quality gate.'],
          id: itemId,
          opportunitySourceType: 'trend',
          opportunityTopic: 'AI launch hooks',
          platform: 'instagram',
          postId: postId.toString(),
          prompt: 'Test prompt',
          status: BatchItemStatus.COMPLETED,
        }),
      );
    });

    it('should count pending and generating items in pendingCount', async () => {
      const mockBatch = createMockBatch({
        items: [
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            status: BatchItemStatus.PENDING,
          },
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.VIDEO,
            status: BatchItemStatus.GENERATING,
          },
          {
            _id: new Types.ObjectId().toString(),
            format: ContentFormat.IMAGE,
            status: BatchItemStatus.COMPLETED,
          },
        ],
      });
      batchModel.findOne.mockResolvedValue(mockBatch);

      const result = await service.getBatch(mockBatch._id!.toString(), orgId);

      expect(result.pendingCount).toBe(2);
    });
  });
});
