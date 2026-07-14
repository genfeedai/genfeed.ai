import type {
  BrandAgentConfig,
  BrandAgentVoice,
  BrandReferenceImage,
} from '@api/collections/brands/schemas/brand.schema';
import type {
  BrandSetupDto,
  ConfirmBrandDataDto,
} from '@api/endpoints/onboarding/dto/brand-setup.dto';
import type {
  LinkedInScrapedData,
  MergedBrandAnalysis,
  XProfileScrapedData,
} from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type {
  IBrandAgentPrompting,
  IExtractedBrandData,
  IScrapedBrandData,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * Shape of the AI brand-voice analysis consumed by the guidance merge.
 */
interface ExtractedBrandVoice {
  audience?: string;
  doNotSoundLike?: string[];
  hashtags?: string[];
  messagingPillars?: string[];
  goals?: string[];
  prompting?: IBrandAgentPrompting;
  sampleOutput?: string;
  taglines?: string[];
  tone?: string;
  topics?: string[];
  values?: string[];
  voice?: string;
}

/**
 * BrandDataMapper
 *
 * Pure, dependency-free mapping between scraper outputs, onboarding DTOs,
 * and the persisted brand shapes. Every scrape source normalizes into
 * IScrapedBrandData through a single builder so the shape cannot drift
 * between branches.
 */
@Injectable()
export class BrandDataMapper {
  /**
   * Single builder for the IScrapedBrandData shape. All normalizers funnel
   * through here so defaults (empty socialLinks/valuePropositions) stay
   * consistent across scrape sources.
   */
  buildScrapedBrandData(
    data: Partial<IScrapedBrandData> &
      Pick<IScrapedBrandData, 'scrapedAt' | 'sourceUrl'>,
  ): IScrapedBrandData {
    return {
      aboutText: undefined,
      companyName: undefined,
      description: undefined,
      fontFamily: undefined,
      heroText: undefined,
      logoUrl: undefined,
      metaDescription: undefined,
      ogImage: undefined,
      primaryColor: undefined,
      secondaryColor: undefined,
      socialLinks: {},
      tagline: undefined,
      valuePropositions: [],
      ...data,
    };
  }

  mapMergedSources(
    merged: MergedBrandAnalysis,
    sourceUrl: string,
  ): IScrapedBrandData {
    return this.buildScrapedBrandData({
      aboutText: merged.aboutText,
      companyName: merged.companyName,
      description: merged.description,
      fontFamily: merged.fontFamily,
      heroText: merged.heroText,
      logoUrl: merged.logoUrl,
      metaDescription: merged.description,
      primaryColor: merged.primaryColor,
      scrapedAt: merged.scrapedAt,
      secondaryColor: merged.secondaryColor,
      socialLinks: merged.socialLinks,
      sourceUrl,
      tagline: merged.tagline,
      valuePropositions: merged.valuePropositions,
    });
  }

  mapLinkedInData(
    linkedinData: LinkedInScrapedData,
    sourceUrl: string,
  ): IScrapedBrandData {
    return this.buildScrapedBrandData({
      companyName: linkedinData.companyName,
      description: linkedinData.description,
      logoUrl: linkedinData.logoUrl,
      metaDescription: linkedinData.description,
      ogImage: linkedinData.coverImageUrl,
      scrapedAt: linkedinData.scrapedAt,
      sourceUrl,
    });
  }

  mapXProfileData(
    xData: XProfileScrapedData,
    sourceUrl: string,
  ): IScrapedBrandData {
    return this.buildScrapedBrandData({
      companyName: xData.displayName,
      description: xData.bio,
      logoUrl: xData.profileImageUrl,
      metaDescription: xData.bio,
      ogImage: xData.profileImageUrl,
      scrapedAt: xData.scrapedAt,
      sourceUrl,
    });
  }

  buildFallbackScrapedData(
    dto: BrandSetupDto,
    existingBrand: { label?: string | null },
  ): IScrapedBrandData {
    const fallbackLabel =
      dto.brandName?.trim() || existingBrand.label?.trim() || 'Brand';

    return this.buildScrapedBrandData({
      companyName: fallbackLabel,
      scrapedAt: new Date(),
      sourceUrl: dto.brandUrl,
    });
  }

  readBrandAgentConfig(value: unknown): BrandAgentConfig {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as BrandAgentConfig;
  }

  readBrandReferenceImages(value: unknown): BrandReferenceImage[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }

      const record = entry as Record<string, unknown>;
      const category =
        typeof record.category === 'string' ? record.category : 'reference';
      const label = typeof record.label === 'string' ? record.label : undefined;
      const url = typeof record.url === 'string' ? record.url : undefined;
      const isDefault =
        typeof record.isDefault === 'boolean' ? record.isDefault : undefined;

      return [
        {
          category,
          ...(isDefault !== undefined ? { isDefault } : {}),
          ...(label ? { label } : {}),
          ...(url ? { url } : {}),
        } as BrandReferenceImage,
      ];
    });
  }

  /**
   * Build a prompt for onboarding preview image generation
   */
  buildPreviewPrompt(
    contentType: string,
    brandName: string,
    brandDescription: string,
    primaryColor: string,
    secondaryColor: string,
  ): string {
    if (contentType === 'ads') {
      return `A stunning high-end advertisement for ${brandName}, ${brandDescription}, featuring a professional model presenting the brand, brand colors ${primaryColor} and ${secondaryColor}, commercial product photography, studio lighting, high fashion`;
    }

    return `A premium social media content post for ${brandName}, ${brandDescription}, featuring an attractive influencer promoting the brand, brand colors ${primaryColor} and ${secondaryColor}, Instagram lifestyle photography, natural lighting, aspirational`;
  }

  parseAudienceList(audience: string): string[] {
    return audience
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  /**
   * Merge the AI-extracted brand voice into the existing agent config,
   * returning the full agentConfig patch payload.
   */
  mergeExtractedVoice(
    brandAgentConfig: BrandAgentConfig,
    extractedData: IExtractedBrandData,
  ): BrandAgentConfig {
    const extractedVoice = extractedData.brandVoice as
      | ExtractedBrandVoice
      | undefined;

    const nextVoice: Partial<BrandAgentVoice> | undefined =
      extractedData.brandVoice
        ? {
            ...(brandAgentConfig.voice ?? {}),
            audience: extractedVoice?.audience
              ? this.parseAudienceList(extractedVoice.audience)
              : (brandAgentConfig.voice?.audience ?? []),
            doNotSoundLike: extractedVoice?.doNotSoundLike ?? [],
            hashtags: extractedVoice?.hashtags ?? [],
            messagingPillars: extractedVoice?.messagingPillars ?? [],
            sampleOutput: extractedVoice?.sampleOutput,
            style: extractedVoice?.voice,
            taglines: extractedVoice?.taglines ?? [],
            tone: extractedVoice?.tone,
            values: extractedVoice?.values ?? [],
          }
        : brandAgentConfig.voice;
    const nextStrategy = extractedVoice
      ? {
          ...(brandAgentConfig.strategy ?? {}),
          goals: extractedVoice.goals ?? brandAgentConfig.strategy?.goals ?? [],
          topics:
            extractedVoice.topics ??
            extractedVoice.messagingPillars ??
            brandAgentConfig.strategy?.topics ??
            [],
        }
      : brandAgentConfig.strategy;

    return {
      ...brandAgentConfig,
      ...(extractedVoice?.prompting
        ? { prompting: extractedVoice.prompting }
        : {}),
      ...(nextStrategy ? { strategy: nextStrategy } : {}),
      ...(nextVoice ? { voice: nextVoice } : {}),
    };
  }

  /**
   * Merge user-provided voice overrides into the existing agent config,
   * returning the full agentConfig patch payload.
   */
  mergeVoiceOverrides(
    brandAgentConfig: BrandAgentConfig,
    dto: ConfirmBrandDataDto,
  ): BrandAgentConfig {
    const existingVoice = brandAgentConfig.voice ?? {};

    return {
      ...brandAgentConfig,
      voice: {
        ...existingVoice,
        ...(dto.audience
          ? { audience: this.parseAudienceList(dto.audience) }
          : {}),
        ...(dto.tone ? { tone: dto.tone } : {}),
        ...(dto.voice ? { style: dto.voice } : {}),
      },
    };
  }
}
