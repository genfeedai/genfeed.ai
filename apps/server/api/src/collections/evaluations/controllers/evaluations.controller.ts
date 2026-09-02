import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CompareEvaluationsDto } from '@api/collections/evaluations/dto/compare-evaluations.dto';
import { EvaluateContentDto } from '@api/collections/evaluations/dto/evaluate-content.dto';
import { EvaluateExternalDto } from '@api/collections/evaluations/dto/evaluate-external.dto';
import { EvaluationFiltersDto } from '@api/collections/evaluations/dto/evaluation-filters.dto';
import type { EvaluationEntityType } from '@api/collections/evaluations/dto/evaluations-query.dto';
import { EvaluationsQueryDto } from '@api/collections/evaluations/dto/evaluations-query.dto';
import { RecordEvaluationReviewDto } from '@api/collections/evaluations/dto/record-evaluation-review.dto';
import type { EvaluationDocument } from '@api/collections/evaluations/schemas/evaluation.schema';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { PrismaFindAllInput } from '@api/shared/services/base/base.service';
import { EvaluationType, IngredientCategory } from '@genfeedai/contracts';
import { EvaluationSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Maps the route-style `entityType` query value (`posts`, `articles`,
 * `images`, `videos`) to the internal `contentType` value stored on the
 * evaluation record (`post`, `article`, `image`, `video`).
 */
const ENTITY_TYPE_TO_CONTENT_TYPE: Record<
  EvaluationEntityType,
  IngredientCategory | 'article' | 'post'
> = {
  articles: 'article',
  images: IngredientCategory.IMAGE,
  posts: 'post',
  videos: IngredientCategory.VIDEO,
};

@AutoSwagger()
@Controller('evaluations')
@UseGuards(RolesGuard)
export class EvaluationsController extends BaseCRUDController<
  EvaluationDocument,
  unknown,
  unknown,
  EvaluationsQueryDto
> {
  constructor(
    public readonly evaluationsService: EvaluationsService,
    public readonly loggerService: LoggerService,
  ) {
    super(
      loggerService,
      evaluationsService,
      EvaluationSerializer,
      'Evaluation',
    );
  }

  /**
   * Evaluations are organization-scoped (not user-scoped) — matches the
   * scoping the removed GET /evaluations/{type}/:id routes used.
   *
   * Extends the base query with (entityType, entityId) filtering:
   * GET /evaluations?entityType=posts&entityId=X returns exactly what the
   * removed GET /evaluations/posts/:id route returned.
   */
  public override buildFindAllQuery(
    user: User,
    query: EvaluationsQueryDto,
  ): PrismaFindAllInput {
    const adminFilter = CollectionFilterUtil.buildAdminFilter(user, query);

    const where: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
      ...(adminFilter ?? { organizationId: user.organizationId }),
    };

    if (query.entityType) {
      where.contentType = ENTITY_TYPE_TO_CONTENT_TYPE[query.entityType];

      if (query.entityId) {
        where.contentId = query.entityId;
      }
    }

    return {
      orderBy: { updatedAt: 'desc' },
      where,
    };
  }

  // ============ DEDICATED ENDPOINTS ============

  /**
   * Evaluate a post/thread
   * POST /evaluations/posts/:id
   * Cost: 1 credit
   */
  @Post('posts/:postId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async evaluatePost(
    @Req() request: Request,
    @Param('postId') postId: string,
    @CurrentUser() user: User,
    @Body() dto: EvaluateContentDto,
  ) {
    const evaluation = await this.evaluationsService.evaluateContent(
      'post',
      postId,
      dto.evaluationType || EvaluationType.PRE_PUBLICATION,
      user.organizationId,
      user.userId ?? user.id,
      user.brandId,
    );

    return serializeSingle(request, EvaluationSerializer, evaluation);
  }

  /**
   * Evaluate an article
   * POST /evaluations/articles/:id
   * Cost: 1 credit
   */
  @Post('articles/:articleId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async evaluateArticle(
    @Req() request: Request,
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
    @Body() dto: EvaluateContentDto,
  ) {
    const evaluation = await this.evaluationsService.evaluateContent(
      'article',
      articleId,
      dto.evaluationType || EvaluationType.PRE_PUBLICATION,
      user.organizationId,
      user.userId ?? user.id,
      user.brandId,
    );

    return serializeSingle(request, EvaluationSerializer, evaluation);
  }

  /**
   * Evaluate an image
   * POST /evaluations/images/:id
   * Cost: 1 credit
   */
  @Post('images/:imageId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async evaluateImage(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
    @Body() dto: EvaluateContentDto,
  ) {
    const evaluation = await this.evaluationsService.evaluateContent(
      IngredientCategory.IMAGE,
      imageId,
      dto.evaluationType || EvaluationType.PRE_PUBLICATION,
      user.organizationId,
      user.userId ?? user.id,
      user.brandId,
    );

    return serializeSingle(request, EvaluationSerializer, evaluation);
  }

  /**
   * Evaluate a video
   * POST /evaluations/videos/:id
   * Cost: 1 credit
   */
  @Post('videos/:videoId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async evaluateVideo(
    @Req() request: Request,
    @Param('videoId') videoId: string,
    @CurrentUser() user: User,
    @Body() dto: EvaluateContentDto,
  ) {
    const evaluation = await this.evaluationsService.evaluateContent(
      IngredientCategory.VIDEO,
      videoId,
      dto.evaluationType || EvaluationType.PRE_PUBLICATION,
      user.organizationId,
      user.userId ?? user.id,
      user.brandId,
    );

    return serializeSingle(request, EvaluationSerializer, evaluation);
  }

  // ============ OTHER ENDPOINTS ============

  /**
   * Evaluate external content from URL
   */
  @Post('external')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async evaluateExternal(
    @Req() request: Request,
    @Body() dto: EvaluateExternalDto,
    @CurrentUser() user: User,
  ) {
    const evaluation = await this.evaluationsService.evaluateExternalUrl(
      dto,
      user.organizationId,
      user.userId ?? user.id,
      user.brandId,
    );

    return serializeSingle(request, EvaluationSerializer, evaluation);
  }

  /**
   * Get evaluation trends and analytics
   */
  @Get('analytics/trends')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getTrends(
    @Query() filters: EvaluationFiltersDto,
    @CurrentUser() user: User,
  ) {
    return await this.evaluationsService.getEvaluationTrends(
      user.organizationId,
      filters,
    );
  }

  /**
   * Compare completed evaluations and rank alternatives
   */
  @Post('compare')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async compareEvaluations(
    @Body() dto: CompareEvaluationsDto,
    @CurrentUser() user: User,
  ) {
    return await this.evaluationsService.compareEvaluations(
      user.organizationId,
      dto,
    );
  }

  /**
   * Record human reviewer feedback for an evaluation
   */
  @Patch(':evaluationId/review')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async recordReviewerFeedback(
    @Req() request: Request,
    @Param('evaluationId') evaluationId: string,
    @CurrentUser() user: User,
    @Body() dto: RecordEvaluationReviewDto,
  ) {
    const evaluation = await this.evaluationsService.recordReviewerFeedback(
      evaluationId,
      user.organizationId,
      user.userId ?? user.id,
      dto,
    );

    return serializeSingle(request, EvaluationSerializer, evaluation);
  }

  /**
   * Soft delete evaluation
   */
  @Delete(':evaluationId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async deleteEvaluation(
    @Param('evaluationId') evaluationId: string,
    @CurrentUser() user: User,
  ) {
    // Use CollectionFilterUtil for ownership filtering
    const ownershipFilter = CollectionFilterUtil.buildOwnershipFilter(user, {
      includeOrganization: true,
      includeUser: true,
    });

    const evaluation = await this.evaluationsService.findOne({
      id: evaluationId,
      ...ownershipFilter,
    });

    if (!evaluation) {
      return returnNotFound(this.constructorName, evaluationId);
    }

    await this.evaluationsService.patch(evaluationId, {
      isDeleted: true,
    });

    return { success: true };
  }
}
