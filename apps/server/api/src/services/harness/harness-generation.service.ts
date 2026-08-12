import { BrandsService } from '@api/collections/brands/services/brands.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import {
  buildHarnessInput,
  formatHarnessBrief,
} from '@api/services/harness/harness-brief.util';
import {
  buildMediaPromptFromHarness,
  type ContentHarnessBrief,
  type ContentKind,
  type ContentObjective,
} from '@genfeedai/harness';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

export type ResolveHarnessBriefParams = {
  brandId?: string;
  contentType: ContentKind;
  objective?: ContentObjective;
  organizationId: string;
  platform?: string;
  topic?: string;
};

/**
 * Single entry for generation paths (text, media, ads, quality) that need a
 * brand harness brief without re-implementing compose + profile load.
 */
@Injectable()
export class HarnessGenerationService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly contentHarnessService: ContentHarnessService,
    private readonly logger: LoggerService,
    @Optional()
    private readonly brandsService?: BrandsService,
    @Optional()
    private readonly harnessProfilesService?: HarnessProfilesService,
  ) {}

  async resolveBrief(
    params: ResolveHarnessBriefParams,
  ): Promise<ContentHarnessBrief | null> {
    if (
      !params.brandId ||
      !this.brandsService ||
      !this.harnessProfilesService
    ) {
      return null;
    }

    try {
      const brand = await this.brandsService.findOne({
        id: params.brandId,
        isDeleted: false,
        organizationId: params.organizationId,
      });
      if (!brand) {
        return null;
      }

      const profileContribution =
        await this.harnessProfilesService.buildContributionForBrand(
          params.organizationId,
          params.brandId,
        );

      return await this.contentHarnessService.composeBrief(
        buildHarnessInput({
          brand,
          intent: {
            contentType: params.contentType,
            objective: params.objective ?? 'engagement',
            platform: params.platform,
            topic: params.topic,
          },
          organizationId: params.organizationId,
          profileContribution: profileContribution ?? undefined,
        }),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} failed to resolve harness brief`,
        {
          brandId: params.brandId,
          error: error instanceof Error ? error.message : 'unknown',
          organizationId: params.organizationId,
        },
      );
      return null;
    }
  }

  async applyToMediaPrompt(params: {
    brandId?: string;
    contentType: ContentKind;
    organizationId: string;
    platform?: string;
    prompt: string;
    topic?: string;
  }): Promise<string> {
    const brief = await this.resolveBrief({
      brandId: params.brandId,
      contentType: params.contentType,
      organizationId: params.organizationId,
      platform: params.platform,
      topic: params.topic,
    });
    return buildMediaPromptFromHarness(params.prompt, brief);
  }

  formatBrief(brief: ContentHarnessBrief | null | undefined): string {
    return formatHarnessBrief(brief);
  }
}
