import type { BrandAgentConfig } from '@api/collections/brands/schemas/brand.schema';
import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import type { BrandSetupDto } from '@api/endpoints/onboarding/dto/brand-setup.dto';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { buildPrefilledAgentConfig } from '@api/services/signup-prefill/utils/agent-config-defaults.util';
import {
  buildBrandSystemPrompt,
  isPlaceholderBrandText,
  PLACEHOLDER_BRAND_DESCRIPTION,
} from '@api/services/signup-prefill/utils/brand-system-prompt.util';
import { buildSignupHarnessProfile } from '@api/services/signup-prefill/utils/harness-seed.util';
import { resolveSignupBrandDomain } from '@genfeedai/helpers';
import type {
  IBrandVoiceAnalysis,
  IExtractedBrandData,
  IScrapedBrandData,
  SignupPrefillWorkflowInput,
} from '@genfeedai/interfaces';
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

export interface SignupPrefillState {
  brandDomain: string | null;
  brandLabel: string;
  brandVoice?: IBrandVoiceAnalysis;
  config: BrandAgentConfig;
  hasHarnessProfile?: boolean;
  request: SignupPrefillWorkflowInput;
  scrapedData?: IScrapedBrandData;
  status: SignupPrefillStatus;
  websiteUrl?: string;
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

  async preparePrefill(
    request: SignupPrefillWorkflowInput,
  ): Promise<SignupPrefillState> {
    const brand = await this.brandsService.findOne(
      { id: request.brandId, organizationId: request.organizationId },
      'none',
    );
    if (!brand) {
      return {
        brandDomain: null,
        brandLabel: request.brandName ?? 'Your brand',
        config: {},
        request,
        status: 'skipped',
      };
    }
    const config = this.brandDataMapper.readBrandAgentConfig(brand.agentConfig);
    const marker = this.readMarker(config);
    if (marker?.status === 'completed' || marker?.status === 'skipped') {
      const hasHarnessProfile = marker.hasHarnessProfile;
      return {
        brandDomain: marker.brandDomain ?? null,
        brandLabel:
          typeof brand.label === 'string' ? brand.label : 'Your brand',
        config,
        ...(hasHarnessProfile === undefined ? {} : { hasHarnessProfile }),
        request,
        status: marker.status,
      };
    }
    const resolved = resolveSignupBrandDomain({
      email: request.email,
      requestedDomain: request.brandDomain,
    });
    const brandLabel = this.resolveBrandLabel(
      request.brandName,
      resolved.brandName,
      typeof brand.label === 'string' ? brand.label : null,
    );
    await this.writeMarker(request.brandId, request.organizationId, config, {
      ...(resolved.domain ? { brandDomain: resolved.domain } : {}),
      startedAt: new Date().toISOString(),
      status: 'running',
    });
    return {
      brandDomain: resolved.domain,
      brandLabel,
      config,
      request,
      status: 'running',
      ...(resolved.websiteUrl ? { websiteUrl: resolved.websiteUrl } : {}),
    };
  }

  async scrapePrefill(state: SignupPrefillState): Promise<SignupPrefillState> {
    if (state.status !== 'running' || !state.websiteUrl) return state;
    return {
      ...state,
      scrapedData: await this.scrapeBrandWebsite(
        state.websiteUrl,
        state.brandLabel,
      ),
    };
  }

  async analyzePrefill(state: SignupPrefillState): Promise<SignupPrefillState> {
    if (!state.scrapedData) return state;
    const brandVoice = await this.analyzeBrandVoice(
      state.scrapedData,
      state.request.organizationId,
      state.request.userId,
    );
    return {
      ...state,
      ...(brandVoice ? { brandVoice } : {}),
    };
  }

  async applyPrefillDefaults(
    state: SignupPrefillState,
  ): Promise<SignupPrefillState> {
    if (state.status !== 'running') return state;
    if (state.scrapedData && state.websiteUrl) {
      await this.persistScrapedBrand({
        brandId: state.request.brandId,
        brandLabel: state.brandLabel,
        brandVoice: state.brandVoice,
        organizationId: state.request.organizationId,
        scrapedData: state.scrapedData,
        userId: state.request.userId,
        websiteUrl: state.websiteUrl,
      });
    }
    const mergedConfig = await this.readAgentConfig(
      state.request.brandId,
      state.request.organizationId,
      state.config,
    );
    const config = buildPrefilledAgentConfig({
      brandLabel: state.brandLabel,
      existingConfig: mergedConfig,
      scrapedData: state.scrapedData,
      timezone: 'UTC',
    });
    await this.brandsService.updateAgentConfig(
      state.request.brandId,
      state.request.organizationId,
      config,
    );
    return { ...state, config };
  }

  async applyPrefillPrompt(
    state: SignupPrefillState,
  ): Promise<SignupPrefillState> {
    if (state.status === 'running') {
      await this.ensureBrandPromptFields(
        state.request.brandId,
        state.brandLabel,
        state.config,
        state.scrapedData,
      );
    }
    return state;
  }

  async applyPrefillHarness(
    state: SignupPrefillState,
  ): Promise<SignupPrefillState> {
    if (state.status !== 'running') return state;
    const hasHarnessProfile = await this.seedHarnessProfile({
      agentConfig: state.config,
      brandId: state.request.brandId,
      brandLabel: state.brandLabel,
      organizationId: state.request.organizationId,
      scrapedData: state.scrapedData,
      userId: state.request.userId,
    });
    return { ...state, hasHarnessProfile };
  }

  async finalizePrefill(
    state: SignupPrefillState,
  ): Promise<SignupPrefillResult> {
    if (state.status !== 'running') {
      return {
        brandDomain: state.brandDomain,
        brandId: state.request.brandId,
        hasBrandVoice: Boolean(state.brandVoice),
        hasHarnessProfile: Boolean(state.hasHarnessProfile),
        status: state.status,
      };
    }
    await this.writeMarker(
      state.request.brandId,
      state.request.organizationId,
      state.config,
      {
        ...(state.brandDomain ? { brandDomain: state.brandDomain } : {}),
        completedAt: new Date().toISOString(),
        hasBrandVoice: Boolean(state.brandVoice),
        hasHarnessProfile: Boolean(state.hasHarnessProfile),
        hasScrapedWebsite: Boolean(state.scrapedData),
        status: 'completed',
      },
    );
    return {
      brandDomain: state.brandDomain,
      brandId: state.request.brandId,
      hasBrandVoice: Boolean(state.brandVoice),
      hasHarnessProfile: Boolean(state.hasHarnessProfile),
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
