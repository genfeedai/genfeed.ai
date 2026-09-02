import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CompareEvaluationsDto } from '@api/collections/evaluations/dto/compare-evaluations.dto';
import { EvaluateExternalDto } from '@api/collections/evaluations/dto/evaluate-external.dto';
import { EvaluationFiltersDto } from '@api/collections/evaluations/dto/evaluation-filters.dto';
import { RecordEvaluationReviewDto } from '@api/collections/evaluations/dto/record-evaluation-review.dto';
import type { EvaluationDocument } from '@api/collections/evaluations/schemas/evaluation.schema';
import {
  type EvaluationAiResult,
  type EvaluationData,
  EvaluationResultProjection,
  type PostEvaluationContent,
  type PostThreadChild,
  type PublicationMetrics,
} from '@api/collections/evaluations/services/evaluation-result.projection';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { resolveIngredientMediaUrl } from '@api/helpers/utils/ingredient-media-url/ingredient-media-url.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { scopedWhere } from '@api/index';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  ActivitySource,
  EvaluationType,
  IngredientCategory,
  Status,
} from '@genfeedai/contracts';
import type {
  IEvaluationComparisonResult,
  IEvaluationTrend,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';

type EvaluationContext = NonNullable<
  Parameters<EvaluationsOperationsService['evaluateVideo']>[1]
>;

const evaluationResultProjection = new EvaluationResultProjection();

@Injectable()
export class EvaluationsService extends BaseService<EvaluationDocument> {
  private readonly constructorName = this.constructor.name;

  private static readonly EVALUATION_MINIMUM_CREDITS = 1;

  private static readonly EVALUATION_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly evaluationsOperationsService: EvaluationsOperationsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly websocketService: NotificationsPublisherService,
    @Optional() private readonly imagesService?: ImagesService,
    @Optional() private readonly videosService?: VideosService,
    @Optional() private readonly articlesService?: ArticlesService,
    @Optional() private readonly postsService?: PostsService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    super(prisma, 'evaluation', logger);
  }

  private resolveMediaUrl(ingredient: {
    cdnUrl?: string | null;
    s3Key?: string | null;
    metadata?: { result?: string | null } | string | null;
  }): string | undefined {
    return resolveIngredientMediaUrl(
      ingredient,
      this.configService?.cdnUrl ?? 'https://cdn.genfeed.ai',
    );
  }

  /**
   * Evaluation JSON stays under `data`; callers and serializers consume the
   * canonical Prisma shape instead of BaseService's Mongo-era JSON flattening.
   */
  protected override normalizeDocument(document: unknown): EvaluationDocument {
    return document as EvaluationDocument;
  }

  private async validateContentForEvaluation(
    contentType: IngredientCategory | 'article' | 'post',
    contentId: string,
    organizationId: string,
  ): Promise<void> {
    switch (contentType) {
      case IngredientCategory.VIDEO: {
        if (!this.videosService) throw new Error('VideosService not available');
        const video = await this.videosService.findOne(
          scopedWhere(organizationId, { id: contentId }),
          [{ path: 'metadata' }],
        );
        if (!video) throw new NotFoundException('Video', contentId);
        if (!this.resolveMediaUrl(video)) {
          throw new NotFoundException(`Video ${contentId} has no result URL`);
        }
        break;
      }
      case IngredientCategory.IMAGE: {
        if (!this.imagesService) throw new Error('ImagesService not available');
        const image = await this.imagesService.findOne(
          scopedWhere(organizationId, { id: contentId }),
          [{ path: 'metadata' }],
        );
        if (!image) throw new NotFoundException('Image', contentId);
        if (!this.resolveMediaUrl(image)) {
          throw new NotFoundException(`Image ${contentId} has no result URL`);
        }
        break;
      }
      case 'article': {
        if (!this.articlesService)
          throw new Error('ArticlesService not available');
        const article = await this.articlesService.findOne(
          scopedWhere(organizationId, { id: contentId }),
        );
        if (!article) throw new NotFoundException('Article', contentId);
        if (!article.content)
          throw new NotFoundException(`Article ${contentId} has no content`);
        break;
      }
      case 'post': {
        if (!this.postsService) throw new Error('PostsService not available');
        const post = await this.postsService.findOne(
          scopedWhere(organizationId, { id: contentId }),
        );
        if (!post) throw new NotFoundException('Post', contentId);
        if (!post.description)
          throw new NotFoundException(`Post ${contentId} has no content`);
        break;
      }
      default:
        throw new Error(`Unsupported content type: ${contentType}`);
    }
  }

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

    await this.validateContentForEvaluation(
      contentType,
      contentId,
      organizationId,
    );
    await this.assertOrganizationCreditsAvailable(
      organizationId,
      EvaluationsService.EVALUATION_MINIMUM_CREDITS,
    );

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

  async evaluateVideo(
    videoId: string,
    evaluationType: EvaluationType,
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<EvaluationDocument> {
    this.logger.log(`Evaluating video: ${videoId}`, this.constructorName);

    if (!this.videosService) throw new Error('VideosService not available');

    const video = await this.videosService.findOne(
      scopedWhere(organizationId, { id: videoId }),
      [{ path: 'metadata' }, { path: 'prompt' }, { path: 'brand' }],
    );

    if (!video) throw new NotFoundException('Video', videoId);

    const videoUrl = this.resolveMediaUrl(video);
    if (!videoUrl)
      throw new NotFoundException(`Video ${videoId} has no result URL`);

    const prompt = video.prompt as { enhanced?: string; original?: string };
    const brand = video.brand as { name?: string; guidelines?: string };

    const context: EvaluationContext = {
      brand: evaluationResultProjection.buildBrandContext(brand),
      prompt:
        evaluationResultProjection.readString(prompt?.enhanced) ??
        evaluationResultProjection.readString(prompt?.original),
    };

    let billedCredits = 0;
    const aiResult = (await this.evaluationsOperationsService.evaluateVideo(
      videoUrl,
      context,
      organizationId,
      (amount) => {
        billedCredits += amount;
      },
    )) as EvaluationAiResult;

    const evaluation = await this.prisma.evaluation.create({
      data: {
        organizationId,
        userId,
        contentType: IngredientCategory.VIDEO,
        contentId: videoId,
        data: evaluationResultProjection.buildStoredEvaluationData({
          analysis: aiResult.analysis,
          brandId,
          evaluationType,
          flags: aiResult.flags,
          overallScore: aiResult.overallScore,
          scores: aiResult.scores,
          status: Status.COMPLETED,
        }) as Prisma.InputJsonValue,
      },
    });

    await this.settleEvaluationCredits(
      organizationId,
      userId,
      billedCredits,
      `Content evaluation: ${IngredientCategory.VIDEO}`,
    );

    return evaluation;
  }

  async evaluateImage(
    imageId: string,
    evaluationType: EvaluationType,
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<EvaluationDocument> {
    this.logger.log(`Evaluating image: ${imageId}`, this.constructorName);

    if (!this.imagesService) throw new Error('ImagesService not available');

    const image = await this.imagesService.findOne(
      scopedWhere(organizationId, { id: imageId }),
      [{ path: 'metadata' }, { path: 'prompt' }, { path: 'brand' }],
    );

    if (!image) throw new NotFoundException('Image', imageId);

    const imageUrl = this.resolveMediaUrl(image);
    if (!imageUrl)
      throw new NotFoundException(`Image ${imageId} has no result URL`);

    const prompt = image.prompt as { enhanced?: string; original?: string };
    const brand = image.brand as { name?: string; guidelines?: string };

    const context: EvaluationContext = {
      brand: evaluationResultProjection.buildBrandContext(brand),
      prompt:
        evaluationResultProjection.readString(prompt?.enhanced) ??
        evaluationResultProjection.readString(prompt?.original),
    };

    let billedCredits = 0;
    const aiResult = (await this.evaluationsOperationsService.evaluateImage(
      imageUrl,
      context,
      organizationId,
      (amount) => {
        billedCredits += amount;
      },
    )) as EvaluationAiResult;

    const evaluation = await this.prisma.evaluation.create({
      data: {
        organizationId,
        userId,
        contentType: IngredientCategory.IMAGE,
        contentId: imageId,
        data: evaluationResultProjection.buildStoredEvaluationData({
          analysis: aiResult.analysis,
          brandId,
          evaluationType,
          flags: aiResult.flags,
          overallScore: aiResult.overallScore,
          scores: aiResult.scores,
          status: Status.COMPLETED,
        }) as Prisma.InputJsonValue,
      },
    });

    await this.settleEvaluationCredits(
      organizationId,
      userId,
      billedCredits,
      `Content evaluation: ${IngredientCategory.IMAGE}`,
    );

    return evaluation;
  }

  async evaluateArticle(
    articleId: string,
    evaluationType: EvaluationType,
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<EvaluationDocument> {
    this.logger.log(`Evaluating article: ${articleId}`, this.constructorName);

    if (!this.articlesService) throw new Error('ArticlesService not available');

    const article = await this.articlesService.findOne(
      scopedWhere(organizationId, { id: articleId }),
      [{ path: 'brand' }],
    );

    if (!article) throw new NotFoundException('Article', articleId);
    if (!article.content)
      throw new NotFoundException(`Article ${articleId} has no content`);

    const brand = article.brand as { name?: string; guidelines?: string };
    const context: EvaluationContext = {
      brand: evaluationResultProjection.buildBrandContext(brand),
      metadata: evaluationResultProjection.serializeJsonRecord({
        category: evaluationResultProjection.readString(article.category),
        summary: evaluationResultProjection.readString(article.summary),
        title: evaluationResultProjection.readString(article.label),
      }),
    };

    let billedCredits = 0;
    const aiResult = (await this.evaluationsOperationsService.evaluateArticle(
      article.content,
      context,
      organizationId,
      (amount) => {
        billedCredits += amount;
      },
    )) as EvaluationAiResult;

    const evaluation = await this.prisma.evaluation.create({
      data: {
        organizationId,
        userId,
        contentType: 'article',
        contentId: articleId,
        data: evaluationResultProjection.buildStoredEvaluationData({
          analysis: aiResult.analysis,
          brandId,
          evaluationType,
          flags: aiResult.flags,
          overallScore: aiResult.overallScore,
          scores: aiResult.scores,
          status: Status.COMPLETED,
        }) as Prisma.InputJsonValue,
      },
    });

    await this.settleEvaluationCredits(
      organizationId,
      userId,
      billedCredits,
      'Content evaluation: article',
    );

    return evaluation;
  }

  async evaluatePost(
    postId: string,
    evaluationType: EvaluationType,
    organizationId: string,
    userId: string,
    brandId: string,
  ): Promise<EvaluationDocument> {
    this.logger.log(`Evaluating post: ${postId}`, this.constructorName);

    if (!this.postsService) throw new Error('PostsService not available');

    const post = await this.postsService.findOne(
      scopedWhere(organizationId, { id: postId }),
      [{ path: 'brand' }],
    );
    if (!post) throw new NotFoundException('Post', postId);
    if (!post.description)
      throw new NotFoundException(`Post ${postId} has no content`);

    const evaluation = await this.prisma.evaluation.create({
      data: {
        organizationId,
        userId,
        contentType: 'post',
        contentId: postId,
        data: evaluationResultProjection.buildStoredEvaluationData({
          brandId,
          evaluationType,
          status: Status.PROCESSING,
        }) as Prisma.InputJsonValue,
      },
    });

    this.evaluatePostAsync(
      evaluation.id,
      post as unknown as PostEvaluationContent,
      organizationId,
      userId,
    ).catch((error) => {
      this.logger.error(
        `Async post evaluation failed: ${(error as Error).message}`,
        {
          error,
          evaluationId: evaluation.id,
          postId,
        },
      );
    });

    return evaluation;
  }

  private async evaluatePostAsync(
    evaluationId: string,
    post: PostEvaluationContent,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const postId = String(post.id);
    let billedCredits = 0;
    let creditsSettled = false;

    try {
      const children = (await this.postsService?.getChildren(postId)) as
        | PostThreadChild[]
        | undefined;
      const previousEvaluation = await this.prisma.evaluation.findFirst({
        where: scopedWhere(organizationId, {
          contentId: postId,
          contentType: 'post',
        }),
        orderBy: { updatedAt: 'desc' },
      });
      const { context, threadContent } =
        evaluationResultProjection.buildPostEvaluationContext(
          post,
          children ?? [],
          previousEvaluation,
        );

      const aiResult = (await this.evaluationsOperationsService.evaluatePost(
        threadContent,
        context as EvaluationContext,
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
      creditsSettled = true;

      const existing = await this.prisma.evaluation.findFirst({
        where: scopedWhere(organizationId, { id: evaluationId }),
      });
      const existingData = (existing?.data as EvaluationData) ?? {};

      const updatedEvaluation = await this.prisma.evaluation.update({
        where: scopedWhere(organizationId, { id: evaluationId }),
        data: {
          data: evaluationResultProjection.buildStoredEvaluationData({
            ...existingData,
            analysis: aiResult.analysis,
            flags: aiResult.flags,
            overallScore: aiResult.overallScore,
            scores: aiResult.scores,
            status: Status.COMPLETED,
          }) as Prisma.InputJsonValue,
        },
      });

      await this.websocketService.emit(
        WebSocketPaths.evaluation(evaluationId),
        { result: updatedEvaluation, status: Status.COMPLETED },
      );

      this.logger.log(
        `Post evaluation completed: ${evaluationId}`,
        this.constructorName,
      );
    } catch (error: unknown) {
      this.logger.error(`Post evaluation failed: ${evaluationId}`, error);

      const existing = await this.prisma.evaluation.findFirst({
        where: scopedWhere(organizationId, { id: evaluationId }),
      });
      const existingData = (existing?.data as EvaluationData) ?? {};

      await this.prisma.evaluation.update({
        where: scopedWhere(organizationId, { id: evaluationId }),
        data: {
          data: evaluationResultProjection.buildStoredEvaluationData({
            ...existingData,
            status: Status.FAILED,
          }) as Prisma.InputJsonValue,
        },
      });

      // Credits were settled before the evaluation ultimately failed (e.g. the
      // completion write threw after the AI charge). Return them so a failed
      // evaluation is never billed.
      if (creditsSettled) {
        await this.refundEvaluationCredits(
          organizationId,
          billedCredits,
          'Content evaluation failed: post',
        );
      }

      await this.websocketService.emit(
        WebSocketPaths.evaluation(evaluationId),
        {
          error: (error as Error)?.message ?? 'Evaluation failed',
          status: Status.FAILED,
        },
      );
    }
  }

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
    throw new HttpException(
      {
        message: 'External content analysis not yet implemented',
        statusCode: 501,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  async recordReviewerFeedback(
    evaluationId: string,
    organizationId: string,
    userId: string,
    dto: RecordEvaluationReviewDto,
  ): Promise<EvaluationDocument> {
    const comment = dto.comment?.trim();
    const tags = evaluationResultProjection.buildReviewTags(dto.tags);

    if (dto.reviewerScore === undefined && !comment && !dto.decision && !tags) {
      throw new BadRequestException(
        'Review feedback must include a score, comment, decision, or tag.',
      );
    }

    const evaluation = await this.prisma.evaluation.findFirst({
      where: scopedWhere(organizationId, { id: evaluationId }),
    });

    if (!evaluation) {
      throw new NotFoundException(`Evaluation ${evaluationId} not found`);
    }

    const reviewedAt = new Date().toISOString();
    const existingData = (evaluation.data as EvaluationData | null) ?? {};

    const updated = await this.prisma.evaluation.update({
      where: scopedWhere(organizationId, { id: evaluationId }),
      data: {
        data: evaluationResultProjection.buildReviewData({
          comment,
          decision: dto.decision,
          existingData,
          reviewedAt,
          reviewerId: userId,
          reviewerScore: dto.reviewerScore,
          tags,
        }) as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  async compareEvaluations(
    organizationId: string,
    dto: CompareEvaluationsDto,
  ): Promise<IEvaluationComparisonResult> {
    const evaluationIds = evaluationResultProjection.normalizeEvaluationIds(
      dto.evaluationIds,
    );

    if (evaluationIds.length < 2) {
      throw new BadRequestException(
        'At least two unique evaluation IDs are required for comparison.',
      );
    }

    const evaluations = await this.prisma.evaluation.findMany({
      where: scopedWhere(organizationId, { id: { in: evaluationIds } }),
      orderBy: { updatedAt: 'desc' },
      take: evaluationIds.length,
    });

    const foundIds = new Set(evaluations.map((evaluation) => evaluation.id));
    const missingIds = evaluationIds.filter(
      (evaluationId) => !foundIds.has(evaluationId),
    );

    if (missingIds.length > 0) {
      throw new NotFoundException(
        `Evaluation(s) not found: ${missingIds.join(', ')}`,
      );
    }

    if (!dto.includeIncomplete) {
      const incompleteIds =
        evaluationResultProjection.findIncompleteEvaluationIds(evaluations);

      if (incompleteIds.length > 0) {
        throw new BadRequestException(
          `Evaluation(s) must be completed before comparison: ${incompleteIds.join(', ')}`,
        );
      }
    }

    return evaluationResultProjection.buildComparisonResult(
      evaluationIds,
      evaluations,
      new Date().toISOString(),
    );
  }

  async syncPostPublicationPerformance(
    evaluationId: string,
    organizationId: string,
    publicationData: Record<string, unknown>,
  ): Promise<EvaluationDocument> {
    this.logger.log(
      `Syncing actual performance for evaluation: ${evaluationId}`,
      this.constructorName,
    );

    const evaluation = await this.prisma.evaluation.findFirst({
      where: scopedWhere(organizationId, { id: evaluationId }),
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation', evaluationId);
    }

    const data = evaluation.data as EvaluationData | null;

    if (!data || data.status !== Status.COMPLETED) {
      throw new NotFoundException(
        `Evaluation ${evaluationId} is not completed (status: ${data?.status}). Cannot sync performance metrics for incomplete evaluations.`,
      );
    }

    const scores = data.scores as Record<string, Record<string, number>> | null;

    if (!scores) {
      throw new NotFoundException(`Evaluation ${evaluationId} has no scores.`);
    }
    if (!scores.engagement) {
      throw new NotFoundException(
        `Evaluation ${evaluationId} has no engagement scores.`,
      );
    }
    if (typeof scores.engagement.overall !== 'number') {
      throw new NotFoundException(
        `Evaluation ${evaluationId} has invalid engagement score.`,
      );
    }

    const metrics = publicationData as PublicationMetrics;
    const predictedEngagement = scores.engagement.overall;

    const updated = await this.prisma.evaluation.update({
      where: scopedWhere(organizationId, { id: evaluationId }),
      data: {
        data: evaluationResultProjection.buildActualPerformanceData(
          data,
          metrics,
          predictedEngagement,
          new Date().toISOString(),
        ) as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  async getEvaluationTrends(
    organizationId: string,
    filters: EvaluationFiltersDto,
  ): Promise<IEvaluationTrend[]> {
    this.logger.log('Getting evaluation trends', this.constructorName);

    const where: Record<string, unknown> = scopedWhere(organizationId, {});

    if (filters.contentType) {
      where.contentType = filters.contentType;
    }

    if (filters.startDate || filters.endDate) {
      const dateFilter: Record<string, unknown> = {};
      if (filters.startDate) dateFilter.gte = new Date(filters.startDate);
      if (filters.endDate) dateFilter.lte = new Date(filters.endDate);
      where.updatedAt = dateFilter;
    }

    const evaluations = await this.prisma.evaluation.findMany({
      where: where as Prisma.EvaluationWhereInput,
      select: { updatedAt: true, data: true },
      orderBy: { updatedAt: 'asc' },
    });

    return evaluationResultProjection.buildEvaluationTrends(
      evaluations,
      filters,
    );
  }

  private async assertOrganizationCreditsAvailable(
    organizationId: string,
    requiredCredits: number,
  ): Promise<void> {
    if (requiredCredits <= 0) return;

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );

    if (hasCredits) return;

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
    if (amount <= 0) return;

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

  private async refundEvaluationCredits(
    organizationId: string,
    amount: number,
    description: string,
  ): Promise<void> {
    if (amount <= 0) return;

    try {
      const refundExpiresAt = new Date();
      refundExpiresAt.setFullYear(refundExpiresAt.getFullYear() + 1);

      await this.creditsUtilsService.refundOrganizationCredits(
        organizationId,
        amount,
        'content-evaluation-refund',
        description,
        refundExpiresAt,
      );
    } catch (error: unknown) {
      // A failed refund must not mask the original evaluation failure — log and
      // move on so the caller still surfaces the FAILED status.
      this.logger.error(
        `Failed to refund evaluation credits for organization ${organizationId}`,
        error,
      );
    }
  }
}
