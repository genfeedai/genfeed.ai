import type { ApplyBrandKitDto } from '@api/collections/brands/dto/apply-brand-kit.dto';
import type { CrawlBrandKitDto } from '@api/collections/brands/dto/crawl-brand-kit.dto';
import type { ManualBrandKitDto } from '@api/collections/brands/dto/manual-brand-kit.dto';
import type { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import type {
  BrandAgentStrategy,
  BrandAgentVoice,
  BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { FontFamily } from '@genfeedai/enums';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromBrand,
  buildBrandKitDraftFromManualInput,
  buildBrandKitDraftFromWebsiteScrape,
} from '@genfeedai/helpers';
import type {
  BrandKitFieldKey,
  IBrandKitApplyResult,
  IBrandKitDiagnostic,
  IBrandKitDraft,
  IExtractedSocialLinks,
  IScrapedBrandData,
} from '@genfeedai/interfaces';
import { BRAND_KIT_FIELD_OWNERSHIP } from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

const BRAND_KIT_SCALAR_FIELDS: Partial<Record<BrandKitFieldKey, string>> = {
  backgroundColor: 'backgroundColor',
  description: 'description',
  fontFamily: 'fontFamily',
  label: 'label',
  primaryColor: 'primaryColor',
  promptGuidelines: 'text',
  secondaryColor: 'secondaryColor',
};
const BRAND_KIT_VOICE_FIELDS: Partial<Record<BrandKitFieldKey, string>> = {
  voiceAudience: 'audience',
  voiceDoNotSoundLike: 'doNotSoundLike',
  voiceMessagingPillars: 'messagingPillars',
  voiceSampleOutput: 'sampleOutput',
  voiceStyle: 'style',
  voiceTone: 'tone',
  voiceValues: 'values',
};
const BRAND_KIT_STRATEGY_FIELDS: Partial<Record<BrandKitFieldKey, string>> = {
  strategyContentTypes: 'contentTypes',
  strategyFrequency: 'frequency',
  strategyGoals: 'goals',
  strategyPlatforms: 'platforms',
};
const BRAND_KIT_DEFERRED_APPLY_FIELDS = new Set<BrandKitFieldKey>([
  'banner',
  'logo',
  'references',
  'socialLinks',
]);
const BRAND_KIT_FIELD_KEYS = new Set<BrandKitFieldKey>(
  BRAND_KIT_FIELD_OWNERSHIP.map((field) => field.key),
);
const BRAND_KIT_STRING_LIST_FIELDS = new Set<BrandKitFieldKey>([
  'strategyContentTypes',
  'strategyGoals',
  'strategyPlatforms',
  'voiceAudience',
  'voiceDoNotSoundLike',
  'voiceMessagingPillars',
  'voiceValues',
]);
const SUPPORTED_FONT_FAMILIES = new Set<string>(Object.values(FontFamily));

type BrandKitDraftBrandFinder = (
  criteria: Record<string, unknown>,
) => Promise<BrandDocument | null>;
type BrandKitBrandPatch = (
  brandId: string,
  updates: Partial<UpdateBrandDto>,
) => Promise<BrandDocument>;

@Injectable()
export class BrandKitDraftService {
  private static readonly SUPPORTED_GUIDANCE_EXTENSIONS = new Set([
    '.csv',
    '.json',
    '.md',
    '.markdown',
    '.txt',
  ]);

  constructor(private readonly brandScraperService: BrandScraperService) {}

  async crawlWebsiteBrandKitDraft(
    brandId: string,
    organizationId: string,
    dto: CrawlBrandKitDto,
    findBrand: BrandKitDraftBrandFinder,
  ): Promise<IBrandKitDraft> {
    const validation = this.brandScraperService.validateUrl(dto.url);
    if (!validation.isValid) {
      throw new BadRequestException({
        code: 'brand_kit_invalid_website_url',
        detail: validation.error ?? 'Invalid website URL',
        title: 'Bad Request',
      });
    }

    const brand = await findBrand({
      id: brandId,
      isDeleted: false,
      organizationId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    try {
      const scraped = await this.brandScraperService.scrapeWebsite(dto.url);
      const diagnostics = this.readSocialUrlDiagnostics(dto.socialUrls);
      const enrichedScrape = this.mergeSocialUrlsIntoScrape(
        scraped,
        dto.socialUrls,
      );

      return buildBrandKitDraftFromWebsiteScrape(
        brand as unknown as BrandKitSourceBrand,
        enrichedScrape,
        {
          diagnostics,
        },
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Website crawl failed';

      return buildBrandKitDraftFromBrand(
        brand as unknown as BrandKitSourceBrand,
        {
          diagnostics: [
            {
              code: 'brand_kit_website_crawl_failed',
              message: `Website crawl failed: ${message}`,
              severity: 'error',
            },
          ],
          evidence: [
            {
              excerpt: message,
              label: 'Website crawl failed',
              sourceType: 'website',
              url: dto.url,
            },
          ],
          sourceType: 'website',
        },
      );
    }
  }

  async applyBrandKitDraft(
    brandId: string,
    organizationId: string,
    dto: ApplyBrandKitDto,
    findBrand: BrandKitDraftBrandFinder,
    patchBrand: BrandKitBrandPatch,
  ): Promise<IBrandKitApplyResult> {
    const brand = await findBrand({
      id: brandId,
      isDeleted: false,
      organizationId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    const diagnostics: IBrandKitDiagnostic[] = [];
    const appliedFields: BrandKitFieldKey[] = [];
    const preservedFields: BrandKitFieldKey[] = [];
    const updateData: Record<string, unknown> = {};
    const voiceUpdates: Record<string, unknown> = {};
    const strategyUpdates: Record<string, unknown> = {};

    for (const [rawKey, decision] of Object.entries(dto.fields ?? {})) {
      if (!this.isBrandKitFieldKey(rawKey)) {
        diagnostics.push({
          code: 'brand_kit_apply_unknown_field',
          message: `${rawKey} is not a supported brand kit field.`,
          severity: 'warning',
        });
        continue;
      }

      if (decision.action === 'preserve' || decision.action === 'reject') {
        preservedFields.push(rawKey);
        continue;
      }

      if (BRAND_KIT_DEFERRED_APPLY_FIELDS.has(rawKey)) {
        preservedFields.push(rawKey);
        diagnostics.push({
          code: 'brand_kit_apply_deferred_field',
          fieldKey: rawKey,
          message:
            'This field was preserved because safe link and asset import is handled by the dedicated Brand Kit asset child issue.',
          severity: 'warning',
        });
        continue;
      }

      const value = this.coerceBrandKitApplyValue(rawKey, decision.value);

      if (value === undefined) {
        diagnostics.push({
          code: 'brand_kit_apply_invalid_value',
          fieldKey: rawKey,
          message: `${rawKey} did not include a supported value.`,
          severity: 'error',
        });
        continue;
      }

      const scalarField = BRAND_KIT_SCALAR_FIELDS[rawKey];
      const voiceField = BRAND_KIT_VOICE_FIELDS[rawKey];
      const strategyField = BRAND_KIT_STRATEGY_FIELDS[rawKey];

      if (scalarField) {
        updateData[scalarField] = value;
        appliedFields.push(rawKey);
        continue;
      }

      if (voiceField) {
        voiceUpdates[voiceField] = value;
        appliedFields.push(rawKey);
        continue;
      }

      if (strategyField) {
        strategyUpdates[strategyField] = value;
        appliedFields.push(rawKey);
        continue;
      }

      preservedFields.push(rawKey);
      diagnostics.push({
        code: 'brand_kit_apply_unsupported_field',
        fieldKey: rawKey,
        message: `${rawKey} is reviewable but not directly applied yet.`,
        severity: 'warning',
      });
    }

    if (
      Object.keys(voiceUpdates).length > 0 ||
      Object.keys(strategyUpdates).length > 0
    ) {
      updateData.agentConfig = this.mergeBrandKitAgentConfig(
        brand.agentConfig,
        voiceUpdates,
        strategyUpdates,
      );
    }

    if (Object.keys(updateData).length > 0) {
      await patchBrand(brandId, updateData as Partial<UpdateBrandDto>);
    }

    const hasBlockingDiagnostic = diagnostics.some(
      (diagnostic) => diagnostic.severity === 'error',
    );

    return {
      appliedFields,
      brandId,
      diagnostics,
      preservedFields,
      status:
        hasBlockingDiagnostic && appliedFields.length === 0
          ? 'blocked'
          : diagnostics.length > 0 || preservedFields.length > 0
            ? 'partial'
            : 'accepted',
    };
  }

  private isBrandKitFieldKey(value: string): value is BrandKitFieldKey {
    return BRAND_KIT_FIELD_KEYS.has(value as BrandKitFieldKey);
  }

  private coerceBrandKitApplyValue(
    key: BrandKitFieldKey,
    value: unknown,
  ): string | string[] | undefined {
    if (key === 'fontFamily') {
      return this.coerceBrandKitFontFamily(value);
    }

    if (BRAND_KIT_STRING_LIST_FIELDS.has(key)) {
      return this.coerceBrandKitStringList(value);
    }

    return this.coerceBrandKitString(value);
  }

  private coerceBrandKitString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private coerceBrandKitFontFamily(value: unknown): string | undefined {
    const normalized = this.coerceBrandKitString(value)
      ?.toLowerCase()
      .replaceAll('_', '-');

    if (!normalized) {
      return undefined;
    }

    return SUPPORTED_FONT_FAMILIES.has(normalized) ? normalized : undefined;
  }

  private coerceBrandKitStringList(value: unknown): string[] | undefined {
    const values = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[\n,]+/)
        : [];

    const normalized = values
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(
        (item, index, all) => item.length > 0 && all.indexOf(item) === index,
      );

    return normalized.length > 0 ? normalized : undefined;
  }

  private toBrandKitRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }

  private mergeBrandKitAgentConfig(
    currentAgentConfig: unknown,
    voiceUpdates: Record<string, unknown>,
    strategyUpdates: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const currentConfig = this.toBrandKitRecord(currentAgentConfig);
    const nextConfig: Record<string, unknown> = { ...currentConfig };

    if (Object.keys(voiceUpdates).length > 0) {
      nextConfig.voice = {
        ...this.toBrandKitRecord(currentConfig.voice),
        ...(voiceUpdates as Partial<BrandAgentVoice>),
      };
    }

    if (Object.keys(strategyUpdates).length > 0) {
      nextConfig.strategy = {
        ...this.toBrandKitRecord(currentConfig.strategy),
        ...(strategyUpdates as Partial<BrandAgentStrategy>),
      };
    }

    return nextConfig as Prisma.InputJsonValue;
  }

  async buildManualBrandKitDraft(
    brandId: string,
    organizationId: string,
    dto: ManualBrandKitDto,
    findBrand: BrandKitDraftBrandFinder,
  ): Promise<IBrandKitDraft> {
    this.validateManualGuidanceDocument(dto.guidanceDocumentName);

    if (!this.hasManualBrandKitInput(dto)) {
      throw new BadRequestException({
        code: 'brand_kit_manual_input_required',
        detail:
          'Provide at least one manual brand field, guidance text, or assigned asset.',
        title: 'Bad Request',
      });
    }

    const brand = await findBrand({
      id: brandId,
      isDeleted: false,
      organizationId,
    });

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    return buildBrandKitDraftFromManualInput(
      brand as unknown as BrandKitSourceBrand,
      dto,
    );
  }

  private validateManualGuidanceDocument(
    guidanceDocumentName: string | undefined,
  ): void {
    if (!guidanceDocumentName) {
      return;
    }

    const lower = guidanceDocumentName.toLowerCase();
    const isSupported = [
      ...BrandKitDraftService.SUPPORTED_GUIDANCE_EXTENSIONS,
    ].some((extension) => lower.endsWith(extension));

    if (!isSupported) {
      throw new BadRequestException({
        code: 'brand_kit_unsupported_guidance_document',
        detail:
          'Upload a text-like guidance file: .txt, .md, .markdown, .json, or .csv.',
        title: 'Bad Request',
      });
    }
  }

  private hasManualBrandKitInput(dto: ManualBrandKitDto): boolean {
    const stringValues = [
      dto.label,
      dto.description,
      dto.primaryColor,
      dto.secondaryColor,
      dto.backgroundColor,
      dto.fontFamily,
      dto.guidanceText,
      dto.voiceTone,
      dto.voiceStyle,
      dto.voiceSampleOutput,
      dto.strategyFrequency,
    ];
    const arrayValues = [
      dto.voiceAudience,
      dto.voiceValues,
      dto.voiceMessagingPillars,
      dto.voiceDoNotSoundLike,
      dto.strategyContentTypes,
      dto.strategyPlatforms,
      dto.strategyGoals,
      dto.assets,
    ];

    return (
      stringValues.some(
        (value) => value !== undefined && value.trim() !== '',
      ) || arrayValues.some((value) => Array.isArray(value) && value.length > 0)
    );
  }

  private mergeSocialUrlsIntoScrape(
    scraped: IScrapedBrandData,
    socialUrls: string[] | undefined,
  ): IScrapedBrandData {
    if (!socialUrls?.length) {
      return scraped;
    }

    const socialLinks: IExtractedSocialLinks = {
      ...(scraped.socialLinks ?? {}),
    };

    for (const url of socialUrls) {
      const validation = this.brandScraperService.validateUrl(url);
      if (!validation.isValid) {
        continue;
      }

      const platform = this.detectSocialPlatform(url);
      if (platform) {
        socialLinks[platform] = url;
      }
    }

    return {
      ...scraped,
      socialLinks,
    };
  }

  private readSocialUrlDiagnostics(
    socialUrls: string[] | undefined,
  ): IBrandKitDraft['diagnostics'] {
    if (!socialUrls?.length) {
      return [];
    }

    return socialUrls.flatMap((url) => {
      const validation = this.brandScraperService.validateUrl(url);
      if (!validation.isValid) {
        return [
          {
            code: 'brand_kit_invalid_social_url',
            message: `${url} was skipped: ${validation.error ?? 'invalid URL'}.`,
            severity: 'warning' as const,
          },
        ];
      }

      return [];
    });
  }

  private detectSocialPlatform(
    url: string,
  ): keyof IExtractedSocialLinks | undefined {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      try {
        hostname = new URL(`https://${url}`).hostname.toLowerCase();
      } catch {
        return undefined;
      }
    }

    // Match the registrable host, not a substring, so look-alike domains like
    // `linkedin.com.evil.test` or `examplex.com` are not misclassified.
    const isHost = (domain: string): boolean =>
      hostname === domain || hostname.endsWith(`.${domain}`);

    if (isHost('instagram.com')) {
      return 'instagram';
    }
    if (isHost('linkedin.com')) {
      return 'linkedin';
    }
    if (isHost('tiktok.com')) {
      return 'tiktok';
    }
    if (isHost('twitter.com') || isHost('x.com')) {
      return 'twitter';
    }
    if (isHost('youtube.com') || isHost('youtu.be')) {
      return 'youtube';
    }
    if (isHost('facebook.com')) {
      return 'facebook';
    }
    return undefined;
  }
}
