/**
 * Articles Transformations Controller
 * Handles routes that derive new content or analysis from an existing article:
 * - Convert to a social thread
 * - Analyze virality
 * - Enhance with AI
 * - Score SEO
 * - Create a remix
 * - Generate a media prompt
 * - Generate image / video configuration
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { CreateRemixArticleDto } from '@api/collections/articles/dto/create-remix-article.dto';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { EditArticleWithAIDto } from '@api/collections/articles/dto/generate-articles.dto';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { ArticlesService } from '@api/collections/articles/services/articles.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { BrandsService } from '@api/collections/brands/services/brands.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { resolveGenerationDefaultModel } from '@api/helpers/utils/generation-defaults/generation-defaults.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { RouterService } from '@api/services/router/router.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { ScoreSeoDto } from '@api/services/seo/dto/score-seo.dto';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import { ActivitySource, ModelCategory } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { ArticleSerializer } from '@genfeedai/serializers';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Entity name used in 404 payloads. Mirrors the `entityName` these routes
 * inherited from `BaseCRUDController` before the split.
 */
const ARTICLE_ENTITY_NAME = 'Article';

/**
 * Not-found `type` used by `returnNotFound`. Kept as the literal
 * `ArticlesController` — before the split this resolved from
 * `BaseCRUDController.constructorName` — so error payloads stay byte-identical.
 */
const ARTICLE_NOT_FOUND_TYPE = 'ArticlesController';

@AutoSwagger()
@Controller('articles')
@UseInterceptors(CreditsInterceptor)
@UseGuards(RolesGuard)
export class ArticlesTransformationsController {
  private readonly serializer = ArticleSerializer;

  constructor(
    private readonly articlesService: ArticlesService,
    private readonly brandsService: BrandsService,
    private readonly loggerService: LoggerService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly routerService: RouterService,
    private readonly seoScorerService: SeoScorerService,
  ) {}

  @Post(':articleId/thread-conversions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async convertToThread(
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    return await this.articlesService.convertToTwitterThread(
      articleId,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );
  }

  @Post(':articleId/virality-analyses')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Article virality analysis (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.ARTICLE_VIRALITY_ANALYSIS,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async analyzeVirality(
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    return await this.articlesService.analyzeVirality(
      articleId,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );
  }

  /**
   * Edit article with AI
   */
  @Post(':articleId/enhancements')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Article enhancement (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.ARTICLE_ENHANCEMENT,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async editWithAI(
    @Req() request: Request,
    @Param('articleId') articleId: string,
    @Body() dto: EditArticleWithAIDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const updatedArticle = await this.articlesService.enhance(
      articleId,
      dto,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    return serializeSingle(request, this.serializer, updatedArticle);
  }

  @Post(':articleId/seo-scores')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'SEO scoring (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.ARTICLE_ENHANCEMENT,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async scoreSeo(
    @Req() request: Request,
    @Param('articleId') articleId: string,
    @Body() dto: ScoreSeoDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const results = await this.articlesService.findAll(
      {
        where: {
          _id: articleId,
          isDeleted: false,
        },
      },
      {
        pagination: false,
      },
    );

    if (!results || !results.docs || results.docs.length === 0) {
      ErrorResponse.notFound(ARTICLE_ENTITY_NAME, articleId);
    }

    const article = results.docs[0];

    if (
      String(article.organization ?? article.organizationId) !==
        publicMetadata.organization.toString() &&
      !getIsSuperAdmin(user, request)
    ) {
      ErrorResponse.notFound(ARTICLE_ENTITY_NAME, articleId);
    }

    await this.seoScorerService.scoreArticle(
      articleId,
      publicMetadata.organization,
      dto.targetKeyword,
    );

    const updatedResults = await this.articlesService.findAll(
      {
        where: {
          _id: articleId,
          isDeleted: false,
        },
      },
      {
        pagination: false,
      },
    );

    return serializeSingle(
      request,
      this.serializer,
      updatedResults?.docs?.[0] ?? article,
    );
  }

  /**
   * Create a remix version of an existing article
   * Copies all content from original article with optional new title
   */
  @Post(':articleId/remixes')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createRemix(
    @Req() request: Request,
    @Param('articleId') articleId: string,
    @Body() dto: CreateRemixArticleDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    try {
      const remixArticle = await this.articlesService.createRemix(
        articleId,
        publicMetadata.user,
        publicMetadata.organization,
        publicMetadata.brand,
        {
          ...(dto.label && { label: `Remix: ${dto.label}` }),
          // instructions: dto.instructions,
        },
      );

      return serializeSingle(request, this.serializer, remixArticle);
    } catch (error: unknown) {
      this.loggerService.error('Failed to create remix article', {
        articleId,
        dto,
        error,
        user,
      });

      throw error;
    }
  }

  @Post(':articleId/prompts')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Media prompt generation (text model)',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.ARTICLE_PROMPT_GENERATION,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generatePrompt(
    @Param('articleId') articleId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const prompt = await this.articlesService.generatePromptFromArticle(
      articleId,
      publicMetadata.user,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    return { prompt };
  }

  @Post(':articleId/images')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateImageFromArticle(
    @Param('articleId') articleId: string,
    @Body() body: { model?: string; width?: number; height?: number },
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    // Get the article
    const article = await this.articlesService.findOne({
      _id: articleId,
      OR: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
      ],
      isDeleted: false,
    });

    if (!article) {
      return returnNotFound(ARTICLE_NOT_FOUND_TYPE, articleId);
    }

    // Get brand for default model
    const brand = article.brandId
      ? await this.brandsService.findOne({
          _id: article.brandId,
          isDeleted: false,
          organization: publicMetadata.organization,
        })
      : null;

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: publicMetadata.organization,
      },
    );
    const model = resolveGenerationDefaultModel<string>({
      brandDefault: brand?.defaultImageModel,
      explicit: body.model,
      organizationDefault: organizationSettings?.defaultImageModel,
      systemDefault: await this.routerService.getDefaultModel(
        ModelCategory.IMAGE,
      ),
    });

    // Return prompt and configuration for frontend to use
    return {
      config: {
        height: body.height || 1024,
        model,
        width: body.width || 1024,
      },
      prompt: article.generationPrompt || article.summary,
    };
  }

  @Post(':articleId/videos')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateVideoFromArticle(
    @Param('articleId') articleId: string,
    @Body() body: { model?: string; duration?: number },
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    // Get the article
    const article = await this.articlesService.findOne({
      _id: articleId,
      OR: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
      ],
      isDeleted: false,
    });

    if (!article) {
      return returnNotFound(ARTICLE_NOT_FOUND_TYPE, articleId);
    }

    // Get brand for default model
    const brand = article.brandId
      ? await this.brandsService.findOne({
          _id: article.brandId,
          isDeleted: false,
          organization: publicMetadata.organization,
        })
      : null;

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: publicMetadata.organization,
      },
    );
    const model = resolveGenerationDefaultModel<string>({
      brandDefault: brand?.defaultVideoModel,
      explicit: body.model,
      organizationDefault: organizationSettings?.defaultVideoModel,
      systemDefault: await this.routerService.getDefaultModel(
        ModelCategory.VIDEO,
      ),
    });

    // Return prompt and configuration for frontend to use
    return {
      config: {
        duration: body.duration || 8,
        model,
      },
      prompt: article.generationPrompt || article.summary,
    };
  }
}
