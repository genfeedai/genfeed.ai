import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { EvaluateExternalDto } from '@api/collections/evaluations/dto/evaluate-external.dto';
import { EvaluationFiltersDto } from '@api/collections/evaluations/dto/evaluation-filters.dto';
import type { EvaluationDocument } from '@api/collections/evaluations/schemas/evaluation.schema';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
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
  id?: string;
  _id?: unknown;
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

type EvaluationData = {
  analysis?: unknown;
  flags?: unknown;
  overallScore?: number;
  scores?: unknown;
  status?: string;
  evaluationType?: string;
  brandId?: string;
  userId?: string;
  actualPerformance?: unknown;
};

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
  ) {
    super(prisma, 'evaluation', logger);
  }

  private async validateContentForEvaluation(
    contentType: IngredientCategory | 'article' | 'post',
    contentId: string,
  ): Promise<void> {
    switch (contentType) {
      case IngredientCategory.VIDEO: {
        if (!this.videosService) throw new Error('VideosService not available');
        const video = await this.videosService.findOne({ _id: contentId }, [
          { path: 'metadata' },
        ]);
        if (!video) throw new NotFoundException(`Video ${contentId} not found`);
        if (!(video.metadata as { result?: string })?.result) {
          throw new NotFoundException(`Video ${contentId} has no result URL`);
        }
        break;
      }
      case IngredientCategory.IMAGE: {
        if (!this.imagesService) throw new Error('ImagesService not available');
        const image = await this.imagesService.findOne({ _id: contentId }, [
          { path: 'metadata' },
        ]);
        if (!image) throw new NotFoundException(`Image ${contentId} not found`);
        if (!(image.metadata as { result?: string })?.result) {
          throw new NotFoundException(`Image ${contentId} has no result URL`);
        }
        break;
      }
      case 'article': {
        if (!this.articlesService)
          throw new Error('ArticlesService not available');
        const article = await this.articlesService.findOne({ _id: contentId });
        if (!article)
          throw new NotFoundException(`Article ${contentId} not found`);
        if (!article.content)
          throw new NotFoundException(`Article ${contentId} has no content`);
        break;
      }
      case 'post': {
        if (!this.postsService) throw new Error('PostsService not available');
        const post = await this.postsService.findOne({ _id: contentId });
        if (!post) throw new NotFoundException(`Post ${contentId} not found`);
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

    await this.validateContentForEvaluation(contentType, contentId);
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

    const video = await this.videosService.findOne({ _id: videoId }, [
      { path: 'metadata' },
      { path: 'prompt' },
      { path: 'brand' },
    ]);

    if (!video) throw new NotFoundException(`Video ${videoId} not found`);

    const metadata = video.metadata as { result?: string };
    const videoUrl = metadata?.result;
    if (!videoUrl)
      throw new NotFoundException(`Video ${videoId} has no result URL`);

    const prompt = video.prompt as { enhanced?: string; original?: string };
    const brand = video.brand as { name?: string; guidelines?: string };

    const context = {
      brand: brand
        ? { guidelines: brand.guidelines, name: brand.name }
        : undefined,
      prompt: prompt?.enhanced || prompt?.original,
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
        data: {
          analysis: aiResult.analysis,
          brandId,
          evaluationType,
          flags: aiResult.flags,
          overallScore: aiResult.overallScore,
          scores: aiResult.scores,
          status: Status.COMPLETED,
        } satisfies EvaluationData,
      },
    });

    await this.settleEvaluationCredits(
      organizationId,
      userId,
      billedCredits,
      `Content evaluation: ${IngredientCategory.VIDEO}`,
    );

    return evaluation as unknown as EvaluationDocument;
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

    const image = await this.imagesService.findOne({ _id: imageId }, [
      { path: 'metadata' },
      { path: 'prompt' },
      { path: 'brand' },
    ]);

    if (!image) throw new NotFoundException(`Image ${imageId} not found`);

    const metadata = image.metadata as { result?: string };
    const imageUrl = metadata?.result;
    if (!imageUrl)
      throw new NotFoundException(`Image ${imageId} has no result URL`);

    const prompt = image.prompt as { enhanced?: string; original?: string };
    const brand = image.brand as { name?: string; guidelines?: string };

    const context = {
      brand: brand
        ? { guidelines: brand.guidelines, name: brand.name }
        : undefined,
      prompt: prompt?.enhanced || prompt?.original,
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
        data: {
          analysis: aiResult.analysis,
          brandId,
          evaluationType,
          flags: aiResult.flags,
          overallScore: aiResult.overallScore,
          scores: aiResult.scores,
          status: Status.COMPLETED,
        } satisfies EvaluationData,
      },
    });

    await this.settleEvaluationCredits(
      organizationId,
      userId,
      billedCredits,
      `Content evaluation: ${IngredientCategory.IMAGE}`,
    );

    return evaluation as unknown as EvaluationDocument;
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

    const article = await this.articlesService.findOne({ _id: articleId }, [
      { path: 'brand' },
    ]);

    if (!article) throw new NotFoundException(`Article ${articleId} not found`);
    if (!article.content)
      throw new NotFoundException(`Article ${articleId} has no content`);

    const brand = article.brand as { name?: string; guidelines?: string };
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
        data: {
          analysis: aiResult.analysis,
          brandId,
          evaluationType,
          flags: aiResult.flags,
          overallScore: aiResult.overallScore,
          scores: aiResult.scores,
          status: Status.COMPLETED,
        } satisfies EvaluationData,
      },
    });

    await this.settleEvaluationCredits(
      organizationId,
      userId,
      billedCredits,
      'Content evaluation: article',
    );

    return evaluation as unknown as EvaluationDocument;
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

    const post = await this.postsService.findOne({ _id: postId }, [
      { path: 'brand' },
    ]);
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    if (!post.description)
      throw new NotFoundException(`Post ${postId} has no content`);

    const evaluation = await this.prisma.evaluation.create({
      data: {
        organizationId,
        userId,
        contentType: 'post',
        contentId: postId,
        data: {
          brandId,
          evaluationType,
          status: Status.PROCESSING,
        } satisfies EvaluationData,
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

    return evaluation as unknown as EvaluationDocument;
  }

  private async evaluatePostAsync(
    evaluationId: string,
    post: PostEvaluationContent,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const postId = String(post.id ?? post._id);

    try {
      const children = (await this.postsService?.getChildren(postId)) as
        | PostThreadChild[]
        | undefined;
      const threadChildren = children ?? [];
      const isThread = threadChildren.length > 0;

      let threadContent = post.description || '';
      if (isThread) {
        const sortedChildren = [...threadChildren].sort(
          (a, b) => (a.order || 0) - (b.order || 0),
        );
        for (const child of sortedChildren) {
          threadContent += `\n---\n${child.description || ''}`;
        }
      }

      const brand = post.brand;

      const prevRaw = await this.prisma.evaluation.findFirst({
        where: {
          contentId: postId,
          contentType: 'post',
          isDeleted: false,
          organizationId,
        },
        orderBy: { updatedAt: 'desc' },
      });

      const prevData = prevRaw?.data as EvaluationData | null;
      const previousEval =
        prevData?.status === Status.COMPLETED &&
        prevData?.overallScore !== undefined &&
        prevData?.scores
          ? {
              overallScore: prevData.overallScore as number,
              scores: prevData.scores as Record<string, unknown>,
              updatedAt: prevRaw!.updatedAt,
            }
          : undefined;

      const context = {
        brand: brand
          ? {
              guidelines: (brand as { guidelines?: unknown }).guidelines,
              name: brand.name,
            }
          : undefined,
        isThread,
        label: post.label,
        platform: post.platform,
        previousEvaluation: previousEval,
        threadLength: isThread ? threadChildren.length + 1 : 1,
      };

      let billedCredits = 0;
      const aiResult = (await this.evaluationsOperationsService.evaluatePost(
        threadContent,
        context as {
          label?: string;
          brand?: { name?: string; guidelines?: unknown };
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

      const existing = await this.prisma.evaluation.findUnique({
        where: { id: evaluationId },
      });
      const existingData = (existing?.data as EvaluationData) ?? {};

      const updatedEvaluation = await this.prisma.evaluation.update({
        where: { id: evaluationId },
        data: {
          data: {
            ...existingData,
            analysis: aiResult.analysis,
            flags: aiResult.flags,
            overallScore: aiResult.overallScore,
            scores: aiResult.scores,
            status: Status.COMPLETED,
          } satisfies EvaluationData,
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

      const existing = await this.prisma.evaluation.findUnique({
        where: { id: evaluationId },
      });
      const existingData = (existing?.data as EvaluationData) ?? {};

      await this.prisma.evaluation.update({
        where: { id: evaluationId },
        data: {
          data: {
            ...existingData,
            status: Status.FAILED,
          } satisfies EvaluationData,
        },
      });

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

  async syncPostPublicationPerformance(
    evaluationId: string,
    publicationData: Record<string, unknown>,
  ): Promise<EvaluationDocument> {
    this.logger.log(
      `Syncing actual performance for evaluation: ${evaluationId}`,
      this.constructorName,
    );

    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      throw new NotFoundException(`Evaluation ${evaluationId} not found`);
    }

    const data = evaluation.data as EvaluationData | null;

    if (data?.status !== Status.COMPLETED) {
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
    const actualEngagement = metrics.engagement || 0;
    const accuracyScore =
      100 - Math.abs(predictedEngagement - actualEngagement);

    const updated = await this.prisma.evaluation.update({
      where: { id: evaluationId },
      data: {
        data: {
          ...data,
          actualPerformance: {
            accuracyScore,
            engagement: actualEngagement,
            engagementRate: metrics.engagementRate || 0,
            syncedAt: new Date().toISOString(),
            views: metrics.views || 0,
          },
        } satisfies EvaluationData,
      },
    });

    return updated as unknown as EvaluationDocument;
  }

  async getContentEvaluations(
    contentType: IngredientCategory | 'article' | 'post',
    contentId: string,
    organizationId: string,
  ): Promise<EvaluationDocument[]> {
    this.logger.log(
      `Getting evaluations for ${contentType} ${contentId}`,
      this.constructorName,
    );

    const evaluations = await this.prisma.evaluation.findMany({
      where: { contentId, contentType, isDeleted: false, organizationId },
      orderBy: { updatedAt: 'desc' },
    });

    return evaluations as unknown as EvaluationDocument[];
  }

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

    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
    };

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
      where: where as never,
      select: { updatedAt: true, data: true },
      orderBy: { updatedAt: 'asc' },
    });

    // Group by date in application code; filter by evaluationType/brand/scores from data JSON
    const grouped = new Map<
      string,
      {
        count: number;
        scores: number[];
        brandScores: number[];
        engagementScores: number[];
        technicalScores: number[];
      }
    >();

    for (const ev of evaluations) {
      const data = ev.data as EvaluationData | null;

      if (
        filters.evaluationType &&
        data?.evaluationType !== filters.evaluationType
      )
        continue;
      if (
        filters.minScore &&
        (data?.overallScore ?? 0) < parseFloat(filters.minScore)
      )
        continue;
      if (
        filters.maxScore &&
        (data?.overallScore ?? 0) > parseFloat(filters.maxScore)
      )
        continue;

      const dateKey = ev.updatedAt.toISOString().slice(0, 10);
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, {
          count: 0,
          scores: [],
          brandScores: [],
          engagementScores: [],
          technicalScores: [],
        });
      }
      const group = grouped.get(dateKey)!;
      group.count++;

      if (typeof data?.overallScore === 'number')
        group.scores.push(data.overallScore);
      const s = data?.scores as Record<string, Record<string, number>> | null;
      if (s?.brand?.overall) group.brandScores.push(s.brand.overall);
      if (s?.engagement?.overall)
        group.engagementScores.push(s.engagement.overall);
      if (s?.technical?.overall)
        group.technicalScores.push(s.technical.overall);
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, group]) => ({
        _id: dateKey,
        avgBrandScore: avg(group.brandScores),
        avgEngagementScore: avg(group.engagementScores),
        avgScore: avg(group.scores),
        avgTechnicalScore: avg(group.technicalScores),
        count: group.count,
      }));
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
}
