import type { BrandAgentConfig } from '@server/collections/brands/schemas/brand.schema';
import { BrandDataMapper } from '@server/collections/brands/services/brand-data.mapper';
import { BrandPersistenceService } from '@server/collections/brands/services/brand-persistence.service';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { HarnessProfilesService } from '@server/collections/harness-profiles/services/harness-profiles.service';
import type { BrandSetupDto } from '@server/endpoints/onboarding/dto/brand-setup.dto';
import { BrandScraperService } from '@server/services/brand-scraper/brand-scraper.service';
import { MasterPromptGeneratorService } from '@server/services/knowledge-base/master-prompt-generator.service';
import { buildPrefilledAgentConfig } from '@server/services/signup-prefill/utils/agent-config-defaults.util';
import {
  buildBrandSystemPrompt,
  isPlaceholderBrandText,
  PLACEHOLDER_BRAND_DESCRIPTION,
} from '@server/services/signup-prefill/utils/brand-system-prompt.util';
import { buildSignupHarnessProfile } from '@server/services/signup-prefill/utils/harness-seed.util';
import { resolveSignupBrandDomain } from '@genfeedai/helpers';
import type {
  IBrandVoiceAnalysis,
  IExtractedBrandData,
  IScrapedBrandData,
} from '@genfeedai/interfaces';
import type { SignupPrefillJobData } from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type SignupPrefillStatus =
  | 'completed'
  | 'failed'
  | 'running'
  | 'skipped';

export interface SignupPrefillMarker {
  brandDomain?: string;
  completedAt?: string;
  hasBrandVoice?: boolean;
  hasScrapedWebsite?: boolean;
  hasHarnessProfile?: boolean;
  startedAt?: string;
  status: SignupPrefillStatus;
}

export interface SignupPrefillResult {
  brandId: string;
  status: SignupPrefillStatus;
  brandDomain: string | null;
  hasBrandVoice: boolean;
  hasHarnessProfile: boolean;
}

/** Placeholder values written by `UserSetupService.getOrCreateBrand`. */
const PLACEHOLDER_BRAND_LABELS = new Set(['Default Organization']);

const PREFILL_MARKER_KEY = 'signupPrefill';

/**
 * SignupPrefillService
 *
 * Turns the placeholder brand created during Better Auth provisioning into a
 * usable one *before* the user writes their first prompt: scrape the corporate
 * domain behind their signup email, run the same AI brand-voice analysis that
 * interactive onboarding runs, persist label/description/colors/system prompt/
 * links/banner, fill the strategy and persona fields the scrape never produces,
 * and seed a default harness profile.
 *
 * It deliberately does NOT complete onboarding or unlock journey rewards — the
 * user still walks their own onboarding; this only removes the empty-brand
 * cold start behind it.
 *
 * Every stage is best-effort. A prefill failure must never leave the account
 * unusable, so the marker records what happened and the brand stays valid.
 */
@Injectable()
export class SignupPrefillService {
  private readonly context = { service: SignupPrefillService.name };

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly brandScraperService: BrandScraperService,
    private readonly brandDataMapper: BrandDataMapper,
    private readonly brandPersistenceService: BrandPersistenceService,
    private readonly masterPromptGeneratorService: MasterPromptGeneratorService,
    private readonly harnessProfilesService: HarnessProfilesService,
  ) {}

  async prefillBrand(
    data: SignupPrefillJobData,
    onProgress?: (percent: number) => Promise<void>,
  ): Promise<SignupPrefillResult> {
    const { brandId, organizationId, userId } = data;
    const brand = await this.brandsService.findOne(
      { id: brandId, organizationId: organizationId },
      'none',
    );

    if (!brand) {
      this.loggerService.warn('Signup prefill skipped — brand not found', {
        ...this.context,
        brandId,
        organizationId,
      });
      return {
        brandDomain: null,
        brandId,
        hasBrandVoice: false,
        hasHarnessProfile: false,
        status: 'skipped',
      };
    }

    const existingConfig = this.brandDataMapper.readBrandAgentConfig(
      brand.agentConfig,
    );
    const existingMarker = this.readMarker(existingConfig);

    // The BullMQ job id already collapses duplicate enqueues; this guards the
    // case where a job is retried after the writes have landed.
    if (
      existingMarker?.status === 'completed' ||
      existingMarker?.status === 'skipped'
    ) {
      this.loggerService.log('Signup prefill already applied', {
        ...this.context,
        brandId,
        status: existingMarker.status,
      });
      return {
        brandDomain: existingMarker.brandDomain ?? null,
        brandId,
        hasBrandVoice: Boolean(existingMarker.hasBrandVoice),
        hasHarnessProfile: Boolean(existingMarker.hasHarnessProfile),
        status: existingMarker.status,
      };
    }

    const resolved = resolveSignupBrandDomain({
      email: data.email,
      requestedDomain: data.brandDomain,
    });
    const brandLabel = this.resolveBrandLabel(
      data.brandName,
      resolved.brandName,
      typeof brand.label === 'string' ? brand.label : null,
    );

    await this.writeMarker(brandId, organizationId, existingConfig, {
      brandDomain: resolved.domain ?? undefined,
      startedAt: new Date().toISOString(),
      status: 'running',
    });
    await onProgress?.(10);

    let scrapedData: IScrapedBrandData | undefined;
    let brandVoice: IBrandVoiceAnalysis | undefined;

    if (resolved.websiteUrl) {
      scrapedData = await this.scrapeBrandWebsite(
        resolved.websiteUrl,
        brandLabel,
      );
      await onProgress?.(35);

      brandVoice = await this.analyzeBrandVoice(
        scrapedData,
        organizationId,
        userId,
      );
      await onProgress?.(60);

      await this.persistScrapedBrand({
        brandId,
        brandLabel,
        brandVoice,
        organizationId,
        scrapedData,
        userId,
        websiteUrl: resolved.websiteUrl,
      });
    } else {
      this.loggerService.log(
        'Signup prefill has no corporate domain — seeding defaults only',
        { ...this.context, brandId },
      );
    }

    await onProgress?.(75);

    // Re-read: `updateBrandGuidance` merged the AI voice into agentConfig, and
    // the defaults must layer on top of that merge rather than the pre-scrape
    // snapshot.
    const mergedConfig = await this.readAgentConfig(
      brandId,
      organizationId,
      existingConfig,
    );
    const prefilledConfig = buildPrefilledAgentConfig({
      brandLabel,
      existingConfig: mergedConfig,
      scrapedData,
      timezone: 'UTC',
    });

    await this.brandsService.updateAgentConfig(
      brandId,
      organizationId,
      prefilledConfig,
    );
    await this.ensureBrandPromptFields(
      brandId,
      brandLabel,
      prefilledConfig,
      scrapedData,
    );
    await onProgress?.(85);

    const hasHarnessProfile = await this.seedHarnessProfile({
      agentConfig: prefilledConfig,
      brandId,
      brandLabel,
      organizationId,
      scrapedData,
      userId,
    });

    await this.writeMarker(brandId, organizationId, prefilledConfig, {
      brandDomain: resolved.domain ?? undefined,
      completedAt: new Date().toISOString(),
      hasBrandVoice: Boolean(brandVoice),
      hasHarnessProfile,
      hasScrapedWebsite: Boolean(scrapedData),
      status: 'completed',
    });
    await onProgress?.(100);

    this.loggerService.log('Signup prefill completed', {
      ...this.context,
      brandDomain: resolved.domain,
      brandId,
      hasBrandVoice: Boolean(brandVoice),
      hasHarnessProfile,
      organizationId,
    });

    return {
      brandDomain: resolved.domain,
      brandId,
      hasBrandVoice: Boolean(brandVoice),
      hasHarnessProfile,
      status: 'completed',
    };
  }

  /**
   * Record a terminal failure on the brand so the onboarding UI can tell
   * "prefill never ran" apart from "prefill ran and found nothing".
   */
  async markPrefillFailed(
    brandId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      const brand = await this.brandsService.findOne(
        { id: brandId, organizationId },
        'none',
      );

      if (!brand) {
        return;
      }

      const config = this.brandDataMapper.readBrandAgentConfig(
        brand.agentConfig,
      );
      await this.writeMarker(brandId, organizationId, config, {
        completedAt: new Date().toISOString(),
        status: 'failed',
      });
    } catch (error: unknown) {
      this.loggerService.warn('Could not record signup prefill failure', {
        ...this.context,
        brandId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * The placeholder label from provisioning carries no signal — prefer the
   * domain-derived name over it, but never overwrite a name the user chose.
   */
  private resolveBrandLabel(
    requestedName: string | undefined,
    domainName: string | null,
    currentLabel: string | null,
  ): string {
    const requested = requestedName?.trim();

    if (requested) {
      return requested;
    }

    const current = currentLabel?.trim();

    if (current && !PLACEHOLDER_BRAND_LABELS.has(current)) {
      return current;
    }

    return domainName?.trim() || current || 'Your brand';
  }

  private async scrapeBrandWebsite(
    websiteUrl: string,
    brandLabel: string,
  ): Promise<IScrapedBrandData> {
    try {
      return await this.brandScraperService.scrapeWebsite(websiteUrl);
    } catch (error: unknown) {
      this.loggerService.warn(
        'Signup prefill scrape failed — continuing with minimal brand data',
        {
          ...this.context,
          error: error instanceof Error ? error.message : String(error),
          websiteUrl,
        },
      );
      return this.brandDataMapper.buildFallbackScrapedData(
        { brandUrl: websiteUrl },
        { label: brandLabel },
      );
    }
  }

  /**
   * Same guard as interactive brand setup: only spend the analysis credit when
   * the scrape actually returned something worth analyzing.
   */
  private async analyzeBrandVoice(
    scrapedData: IScrapedBrandData,
    organizationId: string,
    userId: string,
  ): Promise<IBrandVoiceAnalysis | undefined> {
    const hasAnalyzableContent = Boolean(
      scrapedData.description ||
        scrapedData.aboutText ||
        scrapedData.heroText ||
        scrapedData.tagline ||
        (scrapedData.valuePropositions?.length ?? 0) > 0,
    );

    if (!hasAnalyzableContent) {
      return undefined;
    }

    try {
      return await this.masterPromptGeneratorService.analyzeBrandVoice(
        scrapedData,
        { organizationId, userId },
      );
    } catch (error: unknown) {
      this.loggerService.warn(
        'Signup prefill brand-voice analysis failed — keeping scraped data only',
        {
          ...this.context,
          error: error instanceof Error ? error.message : String(error),
          organizationId,
        },
      );
      return undefined;
    }
  }

  private async persistScrapedBrand(input: {
    brandId: string;
    brandLabel: string;
    brandVoice?: IBrandVoiceAnalysis;
    organizationId: string;
    scrapedData: IScrapedBrandData;
    userId: string;
    websiteUrl: string;
  }): Promise<void> {
    const setupDto: BrandSetupDto = { brandUrl: input.websiteUrl };
    const extractedData: IExtractedBrandData = {
      ...input.scrapedData,
      brandVoice: input.brandVoice,
    };

    await this.brandPersistenceService.updateBrandWithScrapedData(
      input.brandId,
      input.scrapedData,
      setupDto,
      input.brandLabel,
    );
    await this.brandPersistenceService.upsertBrandWebsiteLink(
      input.brandId,
      input.websiteUrl,
    );
    await this.brandPersistenceService.upsertBrandSocialLinks(
      input.brandId,
      input.scrapedData.socialLinks,
    );
    await this.brandPersistenceService.importScrapedBrandBanner(
      input.brandId,
      input.organizationId,
      input.userId,
      input.scrapedData,
    );
    await this.brandPersistenceService.updateBrandGuidance(
      input.brandId,
      input.organizationId,
      extractedData,
    );
    await this.brandPersistenceService.syncBrandAndOrgSlug(
      input.brandLabel,
      input.organizationId,
      input.brandId,
    );
  }

  /**
   * `updateBrandWithScrapedData` only writes `brand.text` when the site gave it
   * a tagline or about copy. A thin scrape — or a personal-email signup with no
   * site at all — would otherwise leave the pre-prompt empty, which is the exact
   * cold start this whole job exists to remove.
   *
   * The provisioning placeholder description is cleared in the same pass: it
   * reads as real brand copy to every prompt builder, so leaving it in place is
   * worse than an empty field.
   */
  private async ensureBrandPromptFields(
    brandId: string,
    brandLabel: string,
    agentConfig: BrandAgentConfig,
    scrapedData?: IScrapedBrandData,
  ): Promise<void> {
    const brand = await this.brandsService.findOne({ id: brandId }, 'none');

    if (!brand) {
      return;
    }

    const update: { description?: string; text?: string } = {};
    const currentText = typeof brand.text === 'string' ? brand.text : null;
    const currentDescription =
      typeof brand.description === 'string' ? brand.description : null;

    if (isPlaceholderBrandText(currentText)) {
      update.text = buildBrandSystemPrompt(
        brandLabel,
        agentConfig,
        scrapedData,
      );
    }

    if (currentDescription?.trim() === PLACEHOLDER_BRAND_DESCRIPTION) {
      update.description =
        scrapedData?.tagline?.trim() ||
        scrapedData?.description?.trim() ||
        `Content brand for ${brandLabel}.`;
    }

    if (Object.keys(update).length > 0) {
      await this.brandsService.patch(brandId, update);
    }
  }

  private async seedHarnessProfile(input: {
    agentConfig: BrandAgentConfig;
    brandId: string;
    brandLabel: string;
    organizationId: string;
    scrapedData?: IScrapedBrandData;
    userId: string;
  }): Promise<boolean> {
    try {
      const existingProfiles = await this.harnessProfilesService.findForBrand(
        input.organizationId,
        input.brandId,
      );

      if (existingProfiles.length > 0) {
        return true;
      }

      await this.harnessProfilesService.create(
        buildSignupHarnessProfile({
          agentConfig: input.agentConfig,
          brandId: input.brandId,
          brandLabel: input.brandLabel,
          scrapedData: input.scrapedData,
        }),
        input.organizationId,
        input.userId,
      );

      return true;
    } catch (error: unknown) {
      this.loggerService.warn(
        'Signup prefill could not seed the default harness profile',
        {
          ...this.context,
          brandId: input.brandId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }

  private async readAgentConfig(
    brandId: string,
    organizationId: string,
    fallback: BrandAgentConfig,
  ): Promise<BrandAgentConfig> {
    const brand = await this.brandsService.findOne(
      { id: brandId, organizationId },
      'none',
    );

    return brand
      ? this.brandDataMapper.readBrandAgentConfig(brand.agentConfig)
      : fallback;
  }

  private readMarker(
    config: BrandAgentConfig,
  ): SignupPrefillMarker | undefined {
    const marker = config[PREFILL_MARKER_KEY];

    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
      return undefined;
    }

    return marker as SignupPrefillMarker;
  }

  private async writeMarker(
    brandId: string,
    organizationId: string,
    config: BrandAgentConfig,
    marker: SignupPrefillMarker,
  ): Promise<void> {
    await this.brandsService.updateAgentConfig(brandId, organizationId, {
      ...config,
      [PREFILL_MARKER_KEY]: {
        ...(this.readMarker(config) ?? {}),
        ...marker,
      },
    });
  }
}
