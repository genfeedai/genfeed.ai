import {
  ArticleGenerationType,
  type GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import {
  assertOrganizationCreditsAvailable,
  resolveTextModelMinimumCredits,
} from '@api/helpers/utils/credits/organization-credits-gate.util';
import type { TextByokDispatch } from '@api/services/byok/text-dispatch-byok.util';
import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Admission for the article text workflows (#5380), shared by the HTTP
 * routes and the agent generation gateway. Resolves the Admin/org models
 * first, then makes the single BYOK decision for every model the workflow
 * dispatches; only a request that is not BYOK must hold the platform-credit
 * floor for its text steps.
 */
@Injectable()
export class ArticleGenerationCreditsService {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly textGenerationCreditsService: TextGenerationCreditsService,
  ) {}

  async admitGeneration(
    request: Request,
    organizationId: string,
    dto: GenerateArticlesDto,
  ): Promise<TextByokDispatch | undefined> {
    const modelConfig =
      await this.articlesService.resolveArticleCycleModelConfig(
        organizationId,
        dto.model,
      );
    const billedModels = [
      modelConfig.generationModel || DEFAULT_TEXT_MODEL,
      modelConfig.reviewModel || DEFAULT_MINI_TEXT_MODEL,
      modelConfig.updateModel || DEFAULT_MINI_TEXT_MODEL,
    ];
    // X articles also draft a header image prompt on DEFAULT_MINI_TEXT_MODEL.
    const hasHeaderPrompt =
      dto.type === ArticleGenerationType.X_ARTICLE &&
      dto.generateHeaderImage !== false;
    const byok = await this.textGenerationCreditsService.ensureDeferredCredits(
      request,
      organizationId,
      hasHeaderPrompt
        ? [...billedModels, DEFAULT_MINI_TEXT_MODEL]
        : billedModels,
    );
    if (!byok) {
      await this.assertMinimumCredits(organizationId, billedModels);
    }
    return byok;
  }

  async admitReview(
    request: Request,
    organizationId: string,
  ): Promise<TextByokDispatch | undefined> {
    const { reviewModel } =
      await this.articlesService.resolveArticleCycleModelConfig(organizationId);
    const model = reviewModel || DEFAULT_MINI_TEXT_MODEL;
    const byok = await this.textGenerationCreditsService.ensureDeferredCredits(
      request,
      organizationId,
      [model],
    );
    if (!byok) {
      await this.assertMinimumCredits(organizationId, [model]);
    }
    return byok;
  }

  private async assertMinimumCredits(
    organizationId: string,
    models: string[],
  ): Promise<void> {
    const amounts = await Promise.all(
      models.map((model) =>
        resolveTextModelMinimumCredits(this.modelsService, model),
      ),
    );
    await assertOrganizationCreditsAvailable(
      this.creditsUtilsService,
      organizationId,
      amounts.reduce((sum, amount) => sum + amount, 0),
    );
  }
}
