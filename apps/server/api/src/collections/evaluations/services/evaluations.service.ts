import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { EvaluateExternalDto } from '@api/collections/evaluations/dto/evaluate-external.dto';
import { EvaluationFiltersDto } from '@api/collections/evaluations/dto/evaluation-filters.dto';
import {
  Evaluation,
  type EvaluationDocument,
} from '@api/collections/evaluations/schemas/evaluation.schema';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { MatchConditions } from '@api/shared/utils/pipeline-builder/pipeline-builder.types';
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import {
  ActivitySource,
  EvaluationType,
  IngredientCategory,
  Status,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type PipelineStage, Types } from 'mongoose';

type EvaluationAiResult = {
  analysis: unknown;
  flags: unknown;
  overallScore: number;
  scores: unknown;
};

type PostThreadChild = {
  description?: string;
  order?: number;
};

type PostBrandContext = {
  guidelines?: unknown;
  name?: string;
};

type PostEvaluationContent = {
  _id: Types.ObjectId | string;
  brand?: PostBrandContext;
  description?: string;
  label?: string;
  platform?: string;
};

type PublicationMetrics = {
  engagement?: number;
  engagementRate?: number;
  views?: number;
};

@Injectable()
export class EvaluationsService extends BaseService<EvaluationDocument> {
  private readonly constructorName = this.constructor.name;

  private static readonly EVALUATION_MINIMUM_CREDITS = 1;

  private static readonly EVALUATION_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    @InjectModel(Evaluation.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<EvaluationDocument>,
    public readonly logger: LoggerService,
    private readonly evaluationsOperationsService: EvaluationsOperationsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly websocketService: NotificationsPublisherService,
    @Optional() private readonly imagesService?: ImagesService,
    @Optional() private readonly videosService?: VideosService,
    @Optional() private readonly articlesService?: ArticlesService,
    @Optional() private readonly postsService?: PostsService,
  ) {
    super(model, logger);
  }

  /**
   * Validate content exists and has required data for evaluation
   * Throws NotFoundException if content is missing or incomplete
   */
  private async validateContentForEvaluation(
    contentType: IngredientCategory | 'article' | 'post',
    contentId: string,
  ): Promise<void> {
    switch (contentType) {
      case IngredientCategory.VIDEO: {
        if (!this.videosService) {
          throw new Error('VideosService not available');
        }
        const video = await this.videosService.findOne(
          { _id: new Types.ObjectId(contentId) },
          [PopulatePatterns.metadataFull],
        );
        if (!video) {
          throw new NotFoundException(`Video ${contentId} not found`);
        }
        const metadata = video.metadata as unknown as { result?: string };
        if (!metadata?.result) {
          throw new NotFoundException(`Video ${contentId} has no result URL`);
        }
        break;
      }
      case IngredientCategory.IMAGE: {
        if (!this.imagesService) {
          throw new Error('ImagesService not available');
        }
        const image = await this.imagesService.findOne(
          { _id: new Types.ObjectId(contentId) },
          [PopulatePatterns.metadataFull],
        );
        if (!image) {
          throw new NotFoundException(`Image ${contentId} not found`);
        }
        const metadata = image.metadata as unknown as { result?: string };
        if (!metadata?.result) {
          throw new NotFoundException(`Image ${contentId} has no result URL`);
        }
        break;
      }
      case 'article': {
        if (!this.articlesService) {
          throw new Error('ArticlesService not available');
        }
        const article = await this.articlesService.findOne({
          _id: new Types.ObjectId(contentId),
        });
        if (!article) {
          throw new NotFoundException(`Article ${contentId} not found`);
        }
        if (!article.content) {
          throw new NotFoundException(`Article ${contentId} has no content`);
        }
        break;
      }
      case 'post': {
        if (!this.postsService) {
          throw new Error('PostsService not available');
        }
        const post = await this.postsService.findOne({
          _id: new Types.ObjectId(contentId),
        });
        if (!post) {
          throw new NotFoundException(`Post ${contentId} not found`);
        }
        if (!post.description) {
          throw new NotFoundException(`Post ${contentId} has no content`);
        }
        break;
      }
      default:
        throw new Error(`Unsupported content type: ${contentType}`);
    }
  }

  /**
   * Evaluate content automatically (orchestrator)
   * Premium text evaluations use a 1-credit minimum precheck and settle actual cost after output.
   */
  async evaluateContent(
    contentType: IngredientCategory | 'article' | 'post',
    contentId: string,
    evaluationType: EvaluationType,
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<EvaluationDocument> {
    this.logger.log(
      `Evaluating content: ${contentType} ${contentId}`,
      this.constructorName,
    );

    // Validate content exists BEFORE deducting credits
    // Prevents billing flows from starting for missing content
    await this.validateContentForEvaluation(contentType, contentId);

    await this.assertOrganizationCreditsAvailable(
      organizationId,
      EvaluationsService.EVALUATION_MINIMUM_CREDITS,
    );

    // Route to specific evaluation method based on content type
    switch (contentType) {
      case IngredientCategory.VIDEO:
        return this.evaluateVideo(
          contentId,
          evaluationType,
          organizationId,
          userId,
          brandId,
        );
      case IngredientCategory.IMAGE:
        return this.evaluateImage(
          contentId,
          evaluationType,
          organizationId,
          userId,
          brandId,
        );
      case 'article':
        return this.evaluateArticle(
          contentId,
          evaluationType,
          organizationId,
          userId,
          brandId,
        );
      case 'post':
        return this.evaluatePost(
          contentId,
          evaluationType,
          organizationId,
          userId,
          brandId,
        );
      default:
        throw new Error(`Unsupported content type: ${contentType}`);
    }
  }

  /**
   * Evaluate video content
   */
  async evaluateVideo(
    videoId: string,
    evaluationType: EvaluationType,
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<EvaluationDocument> {
    this.logger.log(`Evaluating video: ${videoId}`, this.constructorName);

    if (!this.videosService) {
      throw new Error('VideosService not available');
    }

    // Fetch the video with metadata and prompt populated
    const video = await this.videosService.findOne(
      { _id: new Types.ObjectId(videoId) },
      [
        PopulatePatterns.metadataFull,
        PopulatePatterns.promptFull,
        PopulatePatterns.brandMinimal,
      ],
    );

    if (!video) {
      throw new NotFoundException(`Video ${videoId} not found`);
    }

    const metadata = video.metadata as unknown as { result?: string };
    const videoUrl = metadata?.result;

    if (!videoUrl) {
      throw new NotFoundException(`Video ${videoId} has no result URL`);
    }

    // Build context for AI evaluator
    const prompt = video.prompt as unknown as {
      enhanced?: string;
      original?: string;
    };
    const brand = video.brand as unknown as {
      name?: string;
      guidelines?: string;
    };

    const context = {
      brand: brand
        ? { guidelines: brand.guidelines, name: brand.name }
        : undefined,
      prompt: prompt?.enhanced || prompt?.original,
    };

    let billedCredits = 0;

    // Call AI evaluator
    const aiResult = (await this.evaluationsOperationsService.evaluateVideo(
      videoUrl,
      context,
      organizationId,
      (amount) => {
        billedCredits += amount;
      },
    )) as EvaluationAiResult;

    // Create evaluation record
    const evaluation = await this.model.create({
      analysis: aiResult.analysis,
      brand: new Types.ObjectId(brandId),
      content: new Types.ObjectId(videoId),
      contentType: IngredientCategory.VIDEO,
      evaluationType,
      flags: aiResult.flags,
      organization: new Types.ObjectId(organizationId),
      overallScore: aiResult.overallScore,
      scores: aiResult.scores,
      status: Status.COMPLETED,
      user: new Types.ObjectId(userId),
    });

    await this.settleEvaluationCredits(
      organizationId,
      userId,
      billedCredits,
      `Content evaluation: ${IngredientCategory.VIDEO}`,
    );

    return evaluation;
  }

  /**
   * Evaluate image content
   */
  async evaluateImage(
    imageId: string,
    evaluationType: EvaluationType,
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<EvaluationDocument> {
    this.logger.log(`Evaluating image: ${imageId}`, this.constructorName);

    if (!this.imagesService) {
      throw new Error('ImagesService not available');
    }

    // Fetch the image with metadata and prompt populated
    const image = await this.imagesService.findOne(
      { _id: new Types.ObjectId(imageId) },
      [
        PopulatePatterns.metadataFull,
        PopulatePatterns.promptFull,
        PopulatePatterns.brandMinimal,
      ],
    );

    if (!image) {
      throw new NotFoundException(`Image ${imageId} not found`);
    }

    const metadata = image.metadata as unknown as { result?: string };
    const imageUrl = metadata?.result;

    if (!imageUrl) {
      throw new NotFoundException(`Image ${imageId} has no result URL`);
    }

    // Build context for AI evaluator
    const prompt = image.prompt as unknown as {
      enhanced?: string;
      original?: string;
    };
    const brand = image.brand as unknown as {
      name?: string;
      guidelines?: string;
    };

    const context = {
      brand: brand
        ? { guidelines: brand.guidelines, name: brand.name }
        : undefined,
      prompt: prompt?.enhanced || prompt?.original,
    };

    let billedCredits = 0;

    // Call AI evaluator with vision
    const aiResult = (await this.evaluationsOperationsService.evaluateImage(
      imageUrl,
      context,
      organizationId,
      (amount) => {
        billedCredits += amount;
      },
    )) as EvaluationAiResult;

    // Create evaluation record
    const evaluation = await this.model.create({
      analysis: aiResult.analysis,
      brand: new Types.ObjectId(brandId),
      content: new Types.ObjectId(imageId),
      contentType: IngredientCategory.IMAGE,
      evaluationType,
      flags: aiResult.flags,
      organization: new Types.ObjectId(organizationId),
      overallScore: aiResult.overallScore,
      scores: aiResult.scores,
      status: Status.COMPLETED,
      user: new Types.ObjectId(userId),
    });

    await this.settleEvaluationCredits(
      organizationId,
      userId,
      billedCredits,
      `Content evaluation: ${IngredientCategory.IMAGE}`,
    );

    return evaluation;
  }

  /**
   * Evaluate article content
   */
  async evaluateArticle(
    articleId: string,
    evaluationType: EvaluationType,
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<EvaluationDocument> {
    this.logger.log(`Evaluating article: ${articleId}`, this.constructorName);

    if (!this.articlesService) {
      throw new Error('ArticlesService not available');
    }

    // Fetch the article
    const article = await this.articlesService.findOne(
      { _id: new Types.ObjectId(articleId) },
      [PopulatePatterns.brandMinimal],
    );

    if (!article) {
      throw new NotFoundException(`Article ${articleId} not found`);
    }

    if (!article.content) {
      throw new NotFoundException(`Article ${articleId} has no content`);
    }

    // Build context for AI evaluator
    const brand = article.brand as unknown as {
      name?: string;
      guidelines?: string;
    };

    const context = {
      brand: brand
        ? { guidelines: brand.guidelines, name: brand.name }
        : undefined,
      metadata: {
        category: article.category,
        summary: article.summary,
        title: article.label,
      },
    };

    let billedCredits = 0;

    // Call AI evaluator
    const aiResult = (await this.evaluationsOperationsService.evaluateArticle(
      article.content,
      context,
      organizationId,
      (amount) => {
        billedCredits += amount;
      },
    )) as EvaluationAiResult;

    // Create evaluation record
    const evaluation = await this.model.create({
      analysis: aiResult.analysis,
      brand: new Types.ObjectId(brandId),
      content: new Types.ObjectId(articleId),
      contentType: 'article',
      evaluationType,
      flags: aiResult.flags,
      organization: new Types.ObjectId(organizationId),
      overallScore: aiResult.overallScore,
      scores: aiResult.scores,
      status: Status.COMPLETED,
      user: new Types.ObjectId(userId),
    });

    await this.settleEvaluationCredits(
      organizationId,
      userId,
      billedCredits,
      'Content evaluation: article',
    );

    return evaluation;
  }

  /**
   * Evaluate social media post/thread content (async with WebSocket)
   * Returns immediately with PROCESSING status, emits result via WebSocket
   */
  async evaluatePost(
    postId: string,
    evaluationType: EvaluationType,
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<EvaluationDocument> {
    this.logger.log(`Evaluating post: ${postId}`, this.constructorName);

    if (!this.postsService) {
      throw new Error('PostsService not available');
    }

    // Fetch the post with brand populated
    const post = await this.postsService.findOne(
      { _id: new Types.ObjectId(postId) },
      [PopulatePatterns.brandMinimal],
    );

    if (!post) {
      throw new NotFoundException(`Post ${postId} not found`);
    }

    if (!post.description) {
      throw new NotFoundException(`Post ${postId} has no content`);
    }

    // Create evaluation record with PROCESSING status immediately
    const evaluation = await this.model.create({
      brand: new Types.ObjectId(brandId),
      content: new Types.ObjectId(postId),
      contentType: 'post',
      evaluationType,
      organization: new Types.ObjectId(organizationId),
      status: Status.PROCESSING,
      user: new Types.ObjectId(userId),
    });

    // Run AI evaluation async
    this.evaluatePostAsync(
      evaluation._id.toString(),
      post as unknown as PostEvaluationContent,
      organizationId,
      userId,
    ).catch((error) => {
      this.logger.error(`Async post evaluation failed: ${error.message}`, {
        error,
        evaluationId: evaluation._id,
        postId,
      });
    });

    return evaluation;
  }

  /**
   * Async worker for post evaluation
   * Runs in background after immediate response
   */
  private async evaluatePostAsync(
    evaluationId: string,
    post: PostEvaluationContent,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const postId = String(post._id);

    try {
      // Fetch children if this is a thread (parent post)
      const children = (await this.postsService?.getChildren(postId)) as
        | PostThreadChild[]
        | undefined;
      const threadChildren = children ?? [];
      const isThread = threadChildren.length > 0;

      // Build thread content (parent + children in order)
      let threadContent = post.description || '';
      if (isThread) {
        const sortedChildren = [...threadChildren].sort(
          (a, b) => (a.order || 0) - (b.order || 0),
        );

        for (const child of sortedChildren) {
          threadContent += `\n---\n${child.description || ''}`;
        }
      }

      // Build context for AI evaluator
      const brand = post.brand;

      // Fetch previous evaluation for consistency anchoring (exclude current PROCESSING one)
      const previousEvaluation = await this.model
        .findOne({
          content: new Types.ObjectId(postId),
          contentType: 'post',
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
          status: Status.COMPLETED,
        })
        .sort({ updatedAt: -1 })
        .exec();

      const previousEval:
        | {
            overallScore: number;
            scores: Record<string, unknown>;
            updatedAt: Date;
          }
        | undefined =
        previousEvaluation &&
        previousEvaluation.overallScore !== undefined &&
        previousEvaluation.scores
          ? {
              overallScore: previousEvaluation.overallScore as number,
              scores: previousEvaluation.scores as Record<string, unknown>,
              updatedAt: (previousEvaluation as unknown as { updatedAt: Date })
                .updatedAt,
            }
          : undefined;

      const context = {
        brand: brand
          ? {
              guidelines: (brand as { guidelines?: unknown }).guidelines,
              name: (brand as { name?: string }).name,
            }
          : undefined,
        isThread,
        label: post.label as string | undefined,
        platform: post.platform as string | undefined,
        previousEvaluation: previousEval,
        threadLength: isThread ? threadChildren.length + 1 : 1,
      };

      let billedCredits = 0;

      // Call AI evaluator
      const aiResult = (await this.evaluationsOperationsService.evaluatePost(
        threadContent,
        context as {
          label?: string;
          brand?: {
            name?: string;
            guidelines?: unknown;
          };
          platform?: string;
          isThread?: boolean;
          threadLength?: number;
          previousEvaluation?: {
            overallScore: number;
            scores: Record<string, unknown>;
            updatedAt: Date;
          };
        },
        organizationId,
        (amount) => {
          billedCredits += amount;
        },
      )) as EvaluationAiResult;

      await this.settleEvaluationCredits(
        organizationId,
        userId,
        billedCredits,
        'Content evaluation: post',
      );

      // Update evaluation with results
      const updatedEvaluation = await this.model.findByIdAndUpdate(
        evaluationId,
        {
          analysis: aiResult.analysis,
          flags: aiResult.flags,
          overallScore: aiResult.overallScore,
          scores: aiResult.scores,
          status: Status.COMPLETED,
        },
        { returnDocument: 'after' },
      );

      // Emit WebSocket event for completion
      await this.websocketService.emit(
        WebSocketPaths.evaluation(evaluationId),
        {
          result: updatedEvaluation,
          status: Status.COMPLETED,
        },
      );

      this.logger.log(
        `Post evaluation completed: ${evaluationId}`,
        this.constructorName,
      );
    } catch (error: unknown) {
      this.logger.error(`Post evaluation failed: ${evaluationId}`, error);

      // Update evaluation to FAILED status
      await this.model.findByIdAndUpdate(evaluationId, {
        status: Status.FAILED,
      });

      // Emit WebSocket event for failure
      await this.websocketService.emit(
        WebSocketPaths.evaluation(evaluationId),
        {
          error: (error as Error)?.message ?? 'Evaluation failed',
          status: Status.FAILED,
        },
      );
    }
  }

  /**
   * Evaluate external content from URL
   */
  evaluateExternalUrl(
    dto: EvaluateExternalDto,
    _organizationId: string,
    _userId: string,
    _brandId: string,
  ): Promise<EvaluationDocument> {
    this.logger.log(
      `Evaluating external content: ${dto.url}`,
      this.constructorName,
    );
    // Not implemented — return proper HTTP 501
    throw new HttpException(
      {
        message: 'External content analysis not yet implemented',
        statusCode: 501,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Sync actual performance metrics to evaluation
   */
  async syncPostPublicationPerformance(
    evaluationId: string,
    publicationData: Record<string, unknown>,
  ): Promise<EvaluationDocument> {
    this.logger.log(
      `Syncing actual performance for evaluation: ${evaluationId}`,
      this.constructorName,
    );

    const evaluation = await this.model.findById(evaluationId);
    if (!evaluation) {
      throw new NotFoundException(`Evaluation ${evaluationId} not found`);
    }

    // Verify evaluation is completed - only completed evaluations have scores
    if (evaluation.status !== Status.COMPLETED) {
      throw new NotFoundException(
        `Evaluation ${evaluationId} is not completed (status: ${evaluation.status}). Cannot sync performance metrics for incomplete evaluations.`,
      );
    }

    // Verify scores exist and have required engagement data
    const scores = evaluation.scores;
    if (!scores) {
      throw new NotFoundException(
        `Evaluation ${evaluationId} has no scores. Evaluation may not be fully processed yet.`,
      );
    }

    if (!scores.engagement) {
      throw new NotFoundException(
        `Evaluation ${evaluationId} has no engagement scores. Evaluation may not be fully processed yet.`,
      );
    }

    if (typeof scores.engagement.overall !== 'number') {
      throw new NotFoundException(
        `Evaluation ${evaluationId} has invalid engagement score. Evaluation may not be fully processed yet.`,
      );
    }

    // Extract engagement score after validation - TypeScript now knows it's safe
    const metrics = publicationData as PublicationMetrics;
    const predictedEngagement = scores.engagement.overall;
    const actualEngagement = metrics.engagement || 0;
    const accuracyScore =
      100 - Math.abs(predictedEngagement - actualEngagement);

    evaluation.actualPerformance = {
      accuracyScore,
      engagement: actualEngagement,
      engagementRate: metrics.engagementRate || 0,
      syncedAt: new Date(),
      views: metrics.views || 0,
    };

    return await evaluation.save();
  }

  /**
   * Get all evaluations for specific content
   */
  async getContentEvaluations(
    contentType: IngredientCategory | 'article' | 'post',
    contentId: string,
    organizationId: string,
  ): Promise<EvaluationDocument[]> {
    this.logger.log(
      `Getting evaluations for ${contentType} ${contentId}`,
      this.constructorName,
    );

    return await this.model
      .find({
        content: new Types.ObjectId(contentId),
        contentType,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .sort({ updatedAt: -1 });
  }

  /**
   * Get evaluation trends and analytics
   */
  async getEvaluationTrends(
    organizationId: string,
    filters: EvaluationFiltersDto,
  ): Promise<
    Array<{
      _id: string;
      count: number;
      avgScore: number;
      avgBrandScore: number;
      avgEngagementScore: number;
      avgTechnicalScore: number;
    }>
  > {
    this.logger.log('Getting evaluation trends', this.constructorName);

    // Use CollectionFilterUtil for common filtering patterns
    const brandFilter = filters.brand
      ? CollectionFilterUtil.buildBrandFilter(filters.brand, {}, 'none')
      : {};
    const dateRangeFilter = CollectionFilterUtil.buildDateRangeFilter(
      filters.startDate,
      filters.endDate,
      'updatedAt',
    );
    const categoryFilter = filters.contentType
      ? CollectionFilterUtil.buildCategoryFilter(filters.contentType)
      : {};

    // Build match conditions
    const matchConditions: MatchConditions = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      ...(filters.evaluationType && {
        evaluationType: filters.evaluationType,
      }),
      ...categoryFilter,
      ...brandFilter,
      ...dateRangeFilter,
    };

    // Add score filters if provided
    if (filters.minScore || filters.maxScore) {
      const scoreMatch: Record<string, number> = {};
      if (filters.minScore) {
        scoreMatch.$gte = parseFloat(filters.minScore);
      }
      if (filters.maxScore) {
        scoreMatch.$lte = parseFloat(filters.maxScore);
      }
      matchConditions.overallScore = scoreMatch;
    }

    const aggregate: PipelineStage[] = [
      PipelineBuilder.buildMatch(matchConditions),
    ];

    // Add aggregation stages for analytics
    aggregate.push({
      $group: {
        _id: {
          $dateToString: { date: '$updatedAt', format: '%Y-%m-%d' },
        },
        avgBrandScore: { $avg: '$scores.brand.overall' },
        avgEngagementScore: { $avg: '$scores.engagement.overall' },
        avgScore: { $avg: '$overallScore' },
        avgTechnicalScore: { $avg: '$scores.technical.overall' },
        count: { $sum: 1 },
      },
    });

    aggregate.push({
      $sort: { _id: 1 },
    });

    return await this.model.aggregate(aggregate);
  }

  private async assertOrganizationCreditsAvailable(
    organizationId: string,
    requiredCredits: number,
  ): Promise<void> {
    if (requiredCredits <= 0) {
      return;
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );

    if (hasCredits) {
      return;
    }

    const currentBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );
    this.logger.warn(
      `Insufficient credits for evaluation: ${currentBalance} available, ${requiredCredits} required`,
      this.constructorName,
    );
    throw new InsufficientCreditsException(requiredCredits, currentBalance);
  }

  private async settleEvaluationCredits(
    organizationId: string,
    userId: string,
    amount: number,
    description: string,
  ): Promise<void> {
    if (amount <= 0) {
      return;
    }

    await this.creditsUtilsService.deductCreditsFromOrganization(
      organizationId,
      userId,
      amount,
      description,
      ActivitySource.CONTENT_EVALUATION,
      {
        maxOverdraftCredits:
          EvaluationsService.EVALUATION_MAX_OVERDRAFT_CREDITS,
      },
    );
  }
}
