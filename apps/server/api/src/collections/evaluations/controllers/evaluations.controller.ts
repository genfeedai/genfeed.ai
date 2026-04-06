import { EvaluateContentDto } from '@api/collections/evaluations/dto/evaluate-content.dto';
import { EvaluateExternalDto } from '@api/collections/evaluations/dto/evaluate-external.dto';
import { EvaluationFiltersDto } from '@api/collections/evaluations/dto/evaluation-filters.dto';
import { EvaluationsService } from '@api/collections/evaluations/services/evaluations.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import { EvaluationType, IngredientCategory } from '@genfeedai/enums';
import { EvaluationSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('evaluations')
@UseGuards(RolesGuard)
export class EvaluationsController extends BaseCRUDController {
  constructor(
    public readonly evaluationsService: EvaluationsService,
    public readonly loggerService: LoggerService,
  ) {
    super(
      loggerService,
      evaluationsService as unknown,
      EvaluationSerializer,
      'Evaluation',
    );
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
    const publicMetadata = getPublicMetadata(user);

    const evaluation = await this.evaluationsService.evaluateContent(
      'post',
      postId,
      dto.evaluationType || EvaluationType.PRE_PUBLICATION,
      publicMetadata.organization,
      publicMetadata.user,
      publicMetadata.brand,
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
    const publicMetadata = getPublicMetadata(user);

    const evaluation = await this.evaluationsService.evaluateContent(
      'article',
      articleId,
      dto.evaluationType || EvaluationType.PRE_PUBLICATION,
      publicMetadata.organization,
      publicMetadata.user,
      publicMetadata.brand,
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
    const publicMetadata = getPublicMetadata(user);

    const evaluation = await this.evaluationsService.evaluateContent(
      IngredientCategory.IMAGE,
      imageId,
      dto.evaluationType || EvaluationType.PRE_PUBLICATION,
      publicMetadata.organization,
      publicMetadata.user,
      publicMetadata.brand,
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
    const publicMetadata = getPublicMetadata(user);

    const evaluation = await this.evaluationsService.evaluateContent(
      IngredientCategory.VIDEO,
      videoId,
      dto.evaluationType || EvaluationType.PRE_PUBLICATION,
      publicMetadata.organization,
      publicMetadata.user,
      publicMetadata.brand,
    );

    return serializeSingle(request, EvaluationSerializer, evaluation);
  }

  // ============ GET ENDPOINTS ============

  /**
   * Get evaluations for a post
   * GET /evaluations/posts/:id
   */
  @Get('posts/:postId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getPostEvaluations(
    @Req() request: Request,
    @Param('postId') postId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const evaluations = await this.evaluationsService.getContentEvaluations(
      'post',
      postId,
      publicMetadata.organization,
    );

    return serializeCollection(request, EvaluationSerializer, {
      docs: evaluations,
    });
  }

  /**
   * Get evaluations for an article
   * GET /evaluations/articles/:id
   */
  @Get('articles/:articleId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getArticleEvaluations(
    @Req() request: Request,
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const evaluations = await this.evaluationsService.getContentEvaluations(
      'article',
      articleId,
      publicMetadata.organization,
    );

    return serializeCollection(request, EvaluationSerializer, {
      docs: evaluations,
    });
  }

  /**
   * Get evaluations for an image
   * GET /evaluations/images/:id
   */
  @Get('images/:imageId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getImageEvaluations(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const evaluations = await this.evaluationsService.getContentEvaluations(
      IngredientCategory.IMAGE,
      imageId,
      publicMetadata.organization,
    );

    return serializeCollection(request, EvaluationSerializer, {
      docs: evaluations,
    });
  }

  /**
   * Get evaluations for a video
   * GET /evaluations/videos/:id
   */
  @Get('videos/:videoId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getVideoEvaluations(
    @Req() request: Request,
    @Param('videoId') videoId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const evaluations = await this.evaluationsService.getContentEvaluations(
      IngredientCategory.VIDEO,
      videoId,
      publicMetadata.organization,
    );

    return serializeCollection(request, EvaluationSerializer, {
      docs: evaluations,
    });
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
    const publicMetadata = getPublicMetadata(user);

    const evaluation = await this.evaluationsService.evaluateExternalUrl(
      dto,
      publicMetadata.organization,
      publicMetadata.user,
      publicMetadata.brand,
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
    const publicMetadata = getPublicMetadata(user);

    return await this.evaluationsService.getEvaluationTrends(
      publicMetadata.organization,
      filters,
    );
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
    const publicMetadata = getPublicMetadata(user);

    // Use CollectionFilterUtil for ownership filtering
    const ownershipFilter = CollectionFilterUtil.buildOwnershipFilter(
      publicMetadata,
      { includeOrganization: true, includeUser: true },
    );

    const evaluation = await this.evaluationsService.findOne({
      _id: evaluationId,
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
