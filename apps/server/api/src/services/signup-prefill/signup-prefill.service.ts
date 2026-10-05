import type { BrandAgentConfig } from '@api/collections/brands/schemas/brand.schema';
import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import type { BrandSetupDto } from '@api/endpoints/onboarding/dto/brand-setup.dto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { BRAND_SOCIAL_HOSTS } from '@api/services/brand-scraper/brand-social-hosts.constant';
import { BrandWebsiteParserService } from '@api/services/brand-scraper/brand-website-parser.service';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { buildPrefilledAgentConfig } from '@api/services/signup-prefill/utils/agent-config-defaults.util';
import {
  buildBrandSystemPrompt,
  isPlaceholderBrandText,
  PLACEHOLDER_BRAND_DESCRIPTION,
} from '@api/services/signup-prefill/utils/brand-system-prompt.util';
import { buildSignupHarnessProfile } from '@api/services/signup-prefill/utils/harness-seed.util';
import { normalizeOnboardingUrl } from '@api/services/signup-prefill/utils/normalize-onboarding-url.util';
import type {
  IBrandVoiceAnalysis,
  IExtractedBrandData,
  IScrapedBrandData,
  IScrapedBrandDataJson,
  SignupPrefillOptions,
  SignupPrefillSummary,
  SignupPrefillWorkflowInput,
} from '@genfeedai/contracts/interfaces';
import { resolveSignupBrandDomain } from '@genfeedai/helpers';
import { readString } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { resolveSafeDestination } from '@libs/security/destination-guard';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { toPlainJson } from '@serializers/helpers/plain-json.helper';

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
  scrapeStatus?: 'scraped' | 'failed';
  scrapeReason?: string;
  brandId: string;
  status: SignupPrefillStatus;
  brandDomain: string | null;
  hasBrandVoice: boolean;
  hasHarnessProfile: boolean;
}

export interface SignupPrefillState {
  creditsUsed?: number;
  isForced?: boolean;
  summary?: SignupPrefillSummary;
  deadlineAt?: number;
  hasChosenBrandLabel?: boolean;
  scrapeStatus?: 'scraped' | 'failed';
  scrapeReason?: string;
  brandDomain: string | null;
  brandLabel: string;
  brandVoice?: IBrandVoiceAnalysis;
  config: BrandAgentConfig;
  hasHarnessProfile?: boolean;
  request: SignupPrefillWorkflowInput;
  scrapedData?: IScrapedBrandDataJson;
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
  private readonly inFlightScans = new Set<string>();
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

  /** Run the existing stages with an explicit source URL, never the signup marker shortcut. */
  async scanBrandUrl(
    request: SignupPrefillWorkflowInput,
    inputUrl: string,
    onCreditsSettled?: (credits: number) => void,
  ): Promise<SignupPrefillState> {
    const scanKey = `${request.organizationId}:${request.brandId}`;
    if (this.inFlightScans.has(scanKey))
      throw new ConflictException('scan_in_progress');
    this.inFlightScans.add(scanKey);
    let workSettled = false;
    let callerSettled = false;
    let work: Promise<SignupPrefillState> | undefined;
    const deadlineAt = Date.now() + 45_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      work = runWithTenantContext(
        { organizationId: request.organizationId },
        async () => {
          const websiteUrl = normalizeOnboardingUrl(inputUrl);
          try {
            assertUrlNotPrivate(websiteUrl);
            await resolveSafeDestination(websiteUrl);
          } catch {
            throw new BadRequestException(
              'URL must point to a public HTTP(S) destination',
            );
          }
          let state = await this.preparePrefill(request, {
            isForced: true,
            websiteUrl,
            deadlineAt,
          });
          state = await this.scrapePrefill(state);
          if (state.scrapeStatus === 'failed') {
            this.assertDeadline(deadlineAt);
            await this.writeMarker(request.brandId, request.organizationId, {
              status: 'failed',
              completedAt: new Date().toISOString(),
            });
            return { ...state, status: 'failed' as const };
          }
          state = await this.analyzePrefill(state, onCreditsSettled);
          state = await this.applyPrefillDefaults(state);
          state = await this.applyPrefillPrompt(state);
          state = await this.applyPrefillHarness(state);
          await this.finalizePrefill(state);
          this.assertDeadline(deadlineAt);
          const brand = await this.brandsService.findOne(
            {
              id: request.brandId,
              organizationId: request.organizationId,
              isDeleted: false,
            },
            'none',
          );
          this.assertDeadline(deadlineAt);
          if (!brand) throw new NotFoundException('Brand');
          return {
            ...state,
            status: 'completed' as const,
            summary: toPlainJson({
              name: state.brandLabel,
              description: readString(brand.description),
              tone: state.config.voice?.tone,
              primaryColor: readString(brand.primaryColor),
              secondaryColor: readString(brand.secondaryColor),
              logoUrl: state.scrapedData?.logoUrl,
            }),
          };
        },
      )
        .catch(async (error: unknown) => {
          await this.markPrefillFailed(request.brandId, request.organizationId);
          throw error;
        })
        .finally(() => {
          workSettled = true;
          if (callerSettled) this.inFlightScans.delete(scanKey);
        });
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new RequestTimeoutException('Brand scan timed out')),
            45_000,
          );
        }),
      ]);
    } catch (error: unknown) {
      if (!workSettled)
        await this.markPrefillFailed(request.brandId, request.organizationId);
      throw error;
    } finally {
      callerSettled = true;
      if (!work || workSettled) this.inFlightScans.delete(scanKey);
      if (timer) clearTimeout(timer);
    }
  }

  private profileLabel(websiteUrl: string): string | undefined {
    const url = new URL(websiteUrl);
    const hosts = [
      ...Object.values(BRAND_SOCIAL_HOSTS).flat(),
      'youtu.be',
      'linktr.ee',
      'beacons.ai',
      'bio.site',
      'campsite.bio',
      'amazon.com',
      'etsy.com',
      'gumroad.com',
      'stan.store',
    ];
    if (
      !hosts.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    )
      return undefined;
    const segments = url.pathname.split('/').filter(Boolean);
    const prefixes = new Set([
      'company',
      'in',
      'c',
      'user',
      'shop',
      'stores',
      '_u',
    ]);
    const segment = prefixes.has(segments[0] ?? '') ? segments[1] : segments[0];
    if (
      !segment ||
      ['p', 'reel', 'reels', 'watch', 'shorts', 'dp', 'products'].includes(
        segment,
      )
    )
      return '';
    return decodeURIComponent(segment).replace(/^@/, '').trim();
  }

  private scrapedCompanyLabel(
    companyName: string | undefined,
    websiteUrl: string,
  ): string | undefined {
    const name = companyName?.trim();
    if (this.profileLabel(websiteUrl) === undefined) return name;
    const hostName = new URL(websiteUrl).hostname
      .replace(/^www\./, '')
      .split('.')[0];
    const platformNames = new Set([
      hostName,
      new URL(websiteUrl).hostname.replace(/^www\./, ''),
      'linktree',
      'beacons',
      'youtube',
      'facebook',
      'instagram',
      'tiktok',
      'linkedin',
      'twitter',
    ]);
    return name && !platformNames.has(name.toLowerCase()) ? name : undefined;
  }

  private assertDeadline(deadlineAt?: number): void {
    if (deadlineAt !== undefined && Date.now() >= deadlineAt)
      throw new RequestTimeoutException('Brand scan timed out');
  }

  async preparePrefill(
    request: SignupPrefillWorkflowInput,
    options: SignupPrefillOptions = {},
  ): Promise<SignupPrefillState> {
    this.assertDeadline(options.deadlineAt);
    const brand = await this.brandsService.findOne(
      {
        id: request.brandId,
        organizationId: request.organizationId,
        isDeleted: false,
      },
      'none',
    );
    if (!brand) {
      if (options.isForced) throw new NotFoundException('Brand');
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
    if (
      !options.isForced &&
      (marker?.status === 'completed' || marker?.status === 'skipped')
    ) {
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
      requestedDomain: options.websiteUrl
        ? new URL(options.websiteUrl).hostname
        : request.brandDomain,
    });
    const currentLabel = typeof brand.label === 'string' ? brand.label : null;
    const profileLabel = options.websiteUrl
      ? this.profileLabel(options.websiteUrl)
      : undefined;
    const brandLabel = options.isForced
      ? (profileLabel !== undefined
          ? profileLabel
          : resolved.brandName?.trim()) ||
        currentLabel?.trim() ||
        'Your brand'
      : this.resolveBrandLabel(
          request.brandName,
          resolved.brandName,
          currentLabel,
        );
    this.assertDeadline(options.deadlineAt);
    await this.writeMarker(
      request.brandId,
      request.organizationId,
      {
        ...(resolved.domain ? { brandDomain: resolved.domain } : {}),
        startedAt: new Date().toISOString(),
        status: 'running',
      },
      options.deadlineAt,
    );
    const websiteUrl = options.websiteUrl ?? resolved.websiteUrl;
    return {
      brandDomain: resolved.domain,
      brandLabel,
      config,
      request,
      status: 'running',
      ...(options.deadlineAt ? { deadlineAt: options.deadlineAt } : {}),
      ...(options.isForced
        ? {
            isForced: true,
            // The explicit onboarding URL takes precedence over signup labels.
            hasChosenBrandLabel: false,
          }
        : {}),
      ...(websiteUrl ? { websiteUrl } : {}),
    };
  }

  async scrapePrefill(state: SignupPrefillState): Promise<SignupPrefillState> {
    if (state.status !== 'running' || !state.websiteUrl) return state;
    this.assertDeadline(state.deadlineAt);
    let scrapedData: IScrapedBrandData;
    let scrapeStatus: 'scraped' | 'failed' = 'scraped';
    try {
      scrapedData = state.deadlineAt
        ? (
            await this.brandScraperService.scrapeWebsiteWithEvidence(
              state.websiteUrl,
              {
                deadlineAt:
                  performance.now() +
                  Math.max(0, state.deadlineAt - Date.now()),
              },
            )
          ).data
        : await this.brandScraperService.scrapeWebsite(state.websiteUrl);
    } catch (error: unknown) {
      if (error instanceof RequestTimeoutException) throw error;
      scrapeStatus = 'failed';
      this.loggerService.warn(
        'Signup prefill scrape failed — continuing with minimal brand data',
        {
          ...this.context,
          error: error instanceof Error ? error.message : String(error),
          websiteUrl: new BrandWebsiteParserService().sanitizeProvenanceUrl(
            state.websiteUrl,
          ),
        },
      );
      scrapedData = this.brandDataMapper.buildFallbackScrapedData(
        { brandUrl: state.websiteUrl },
        { label: state.brandLabel },
      );
    }
    this.assertDeadline(state.deadlineAt);
    return {
      ...state,
      brandLabel:
        state.hasChosenBrandLabel === false && scrapeStatus === 'scraped'
          ? this.scrapedCompanyLabel(
              scrapedData.companyName,
              state.websiteUrl,
            ) || state.brandLabel
          : state.brandLabel,
      scrapeStatus,
      ...(scrapeStatus === 'failed' ? { scrapeReason: 'scrape_failed' } : {}),
      scrapedData: toPlainJson({
        ...scrapedData,
        scrapedAt: scrapedData.scrapedAt.toISOString(),
      }),
    };
  }

  async analyzePrefill(
    state: SignupPrefillState,
    onCreditsSettled?: (credits: number) => void,
  ): Promise<SignupPrefillState> {
    this.assertDeadline(state.deadlineAt);
    if (!state.scrapedData) return state;
    let creditsUsed = 0;
    const brandVoice = await this.analyzeBrandVoice(
      this.readScrapedData(state.scrapedData),
      state.request.organizationId,
      state.request.userId,
      state.deadlineAt,
      (credits) => {
        creditsUsed += credits;
        onCreditsSettled?.(credits);
      },
    );
    this.assertDeadline(state.deadlineAt);
    return {
      ...state,
      ...(state.isForced ? { creditsUsed } : {}),
      ...(brandVoice ? { brandVoice } : {}),
    };
  }

  async applyPrefillDefaults(
    state: SignupPrefillState,
  ): Promise<SignupPrefillState> {
    this.assertDeadline(state.deadlineAt);
    if (state.status !== 'running') return state;
    const scrapedData = state.scrapedData
      ? this.readScrapedData(state.scrapedData)
      : undefined;
    if (scrapedData && state.websiteUrl) {
      await this.persistScrapedBrand({
        isForced: state.isForced,
        deadlineAt: state.deadlineAt,
        brandId: state.request.brandId,
        brandLabel: state.brandLabel,
        brandVoice: state.brandVoice,
        organizationId: state.request.organizationId,
        scrapedData,
        userId: state.request.userId,
        websiteUrl: state.websiteUrl,
      });
    }
    this.assertDeadline(state.deadlineAt);
    const mergedConfig = await this.readAgentConfig(
      state.request.brandId,
      state.request.organizationId,
    );
    const config = buildPrefilledAgentConfig({
      brandLabel: state.brandLabel,
      existingConfig: mergedConfig,
      scrapedData,
      timezone: 'UTC',
    });
    this.assertDeadline(state.deadlineAt);
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
    this.assertDeadline(state.deadlineAt);
    if (state.status === 'running') {
      await this.ensureBrandPromptFields(
        state.request.brandId,
        state.brandLabel,
        state.request.organizationId,
        state.config,
        state.deadlineAt,
        state.scrapedData ? this.readScrapedData(state.scrapedData) : undefined,
      );
    }
    return state;
  }

  async applyPrefillHarness(
    state: SignupPrefillState,
  ): Promise<SignupPrefillState> {
    this.assertDeadline(state.deadlineAt);
    if (state.status !== 'running') return state;
    const hasHarnessProfile = await this.seedHarnessProfile({
      deadlineAt: state.deadlineAt,
      agentConfig: state.config,
      brandId: state.request.brandId,
      brandLabel: state.brandLabel,
      organizationId: state.request.organizationId,
      scrapedData: state.scrapedData
        ? this.readScrapedData(state.scrapedData)
        : undefined,
      userId: state.request.userId,
    });
    return { ...state, hasHarnessProfile };
  }

  async finalizePrefill(
    state: SignupPrefillState,
  ): Promise<SignupPrefillResult> {
    this.assertDeadline(state.deadlineAt);
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
      {
        ...(state.brandDomain ? { brandDomain: state.brandDomain } : {}),
        completedAt: new Date().toISOString(),
        hasBrandVoice: Boolean(state.brandVoice),
        hasHarnessProfile: Boolean(state.hasHarnessProfile),
        hasScrapedWebsite: Boolean(state.scrapedData),
        status: 'completed',
      },
      state.deadlineAt,
    );
    return {
      ...(state.scrapeStatus ? { scrapeStatus: state.scrapeStatus } : {}),
      ...(state.scrapeReason ? { scrapeReason: state.scrapeReason } : {}),
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
        { id: brandId, organizationId, isDeleted: false },
        'none',
      );

      if (!brand) {
        return;
      }

      await this.writeMarker(brandId, organizationId, {
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

  private readScrapedData(data: IScrapedBrandDataJson): IScrapedBrandData {
    return { ...data, scrapedAt: new Date(data.scrapedAt) };
  }

  /**
   * Same guard as interactive brand setup: only spend the analysis credit when
   * the scrape actually returned something worth analyzing.
   */
  private async analyzeBrandVoice(
    scrapedData: IScrapedBrandData,
    organizationId: string,
    userId: string,
    deadlineAt?: number,
    onCreditsSettled?: (credits: number) => void,
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
        { deadlineAt, onCreditsSettled },
      );
    } catch (error: unknown) {
      if (error instanceof RequestTimeoutException) throw error;
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
    isForced?: boolean;
    deadlineAt?: number;
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
    const brand = await this.brandsService.findOne(
      {
        id: input.brandId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      'none',
    );
    const currentDescription =
      typeof brand?.description === 'string' ? brand.description : null;
    // A description the user wrote when creating the organization wins over
    // the site's meta description.
    const scrapedForBrand: IScrapedBrandData = isPlaceholderBrandText(
      currentDescription,
    )
      ? input.scrapedData
      : { ...input.scrapedData, description: undefined };

    this.assertDeadline(input.deadlineAt);
    await this.brandPersistenceService.updateBrandWithScrapedData(
      input.brandId,
      scrapedForBrand,
      setupDto,
      input.brandLabel,
    );
    this.assertDeadline(input.deadlineAt);
    await this.brandPersistenceService.upsertBrandWebsiteLink(
      input.brandId,
      input.websiteUrl,
    );
    this.assertDeadline(input.deadlineAt);
    await this.brandPersistenceService.upsertBrandSocialLinks(
      input.brandId,
      input.scrapedData.socialLinks,
    );
    this.assertDeadline(input.deadlineAt);
    await this.brandPersistenceService.autofillScrapedBrandAssets(
      input.brandId,
      input.organizationId,
      input.userId,
      input.scrapedData,
    );
    this.assertDeadline(input.deadlineAt);
    await this.brandPersistenceService.updateBrandGuidance(
      input.brandId,
      input.organizationId,
      extractedData,
      input.isForced,
    );
    this.assertDeadline(input.deadlineAt);
    await this.brandPersistenceService.syncBrandAndOrgSlug(
      input.brandLabel,
      input.organizationId,
      input.brandId,
      input.brandLabel,
      input.isForced,
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
    organizationId: string,
    agentConfig: BrandAgentConfig,
    deadlineAt?: number,
    scrapedData?: IScrapedBrandData,
  ): Promise<void> {
    const brand = await this.brandsService.findOne(
      { id: brandId, organizationId, isDeleted: false },
      'none',
    );

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
        isPlaceholderBrandText(currentDescription)
          ? undefined
          : (currentDescription ?? undefined),
      );
    }

    if (currentDescription?.trim() === PLACEHOLDER_BRAND_DESCRIPTION) {
      update.description =
        scrapedData?.tagline?.trim() ||
        scrapedData?.description?.trim() ||
        `Content brand for ${brandLabel}.`;
    }

    if (Object.keys(update).length > 0) {
      this.assertDeadline(deadlineAt);
      await this.brandsService.patch(brandId, update);
    }
  }

  private async seedHarnessProfile(input: {
    deadlineAt?: number;
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

      this.assertDeadline(input.deadlineAt);
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
      if (error instanceof RequestTimeoutException) throw error;
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
  ): Promise<BrandAgentConfig> {
    const brand = await this.brandsService.findOne(
      { id: brandId, organizationId, isDeleted: false },
      'none',
    );

    if (!brand) throw new NotFoundException('Brand');
    return this.brandDataMapper.readBrandAgentConfig(brand.agentConfig);
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
    marker: SignupPrefillMarker,
    deadlineAt?: number,
  ): Promise<void> {
    const currentConfig = await this.readAgentConfig(brandId, organizationId);
    this.assertDeadline(deadlineAt);
    await this.brandsService.updateAgentConfig(brandId, organizationId, {
      [PREFILL_MARKER_KEY]: {
        ...(this.readMarker(currentConfig) ?? {}),
        ...marker,
      },
    });
  }
}
