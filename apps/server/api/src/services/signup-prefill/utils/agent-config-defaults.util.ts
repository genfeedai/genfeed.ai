import type {
  BrandAgentConfig,
  BrandAgentStrategy,
  BrandAgentVoice,
} from '@api/collections/brands/schemas/brand.schema';
import { Platform } from '@genfeedai/enums';
import type { IScrapedBrandData } from '@genfeedai/interfaces';

import { readStringList } from './string-list.util';

/**
 * Content types the three default recurring workflows produce
 * (`DefaultRecurringContentService`). Seeding the same set keeps the agent's
 * strategy and the brand's scheduled output describing the same thing.
 */
export const DEFAULT_STRATEGY_CONTENT_TYPES = [
  'post',
  'newsletter',
  'image',
] as const;

export const DEFAULT_STRATEGY_FREQUENCY = 'daily';

const DEFAULT_ACTIVE_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
] as const;

const SOCIAL_LINK_PLATFORMS: Record<string, Platform> = {
  facebook: Platform.FACEBOOK,
  instagram: Platform.INSTAGRAM,
  linkedin: Platform.LINKEDIN,
  tiktok: Platform.TIKTOK,
  twitter: Platform.TWITTER,
  youtube: Platform.YOUTUBE,
};

export interface BuildPrefilledAgentConfigInput {
  brandLabel: string;
  existingConfig: BrandAgentConfig;
  scrapedData?: IScrapedBrandData;
  timezone?: string;
}

function hasEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Platforms the brand demonstrably already publishes on, read off the social
 * links found while scraping. Deliberately empty when nothing was found — a
 * guessed platform list produces content aimed at an audience the brand has no
 * account for.
 */
export function derivePlatformsFromSocialLinks(
  socialLinks: IScrapedBrandData['socialLinks'],
): string[] {
  if (!socialLinks) {
    return [];
  }

  return Object.entries(socialLinks).reduce<string[]>(
    (platforms, [key, url]) => {
      const platform = SOCIAL_LINK_PLATFORMS[key];

      if (platform && typeof url === 'string' && url.trim()) {
        platforms.push(platform);
      }

      return platforms;
    },
    [],
  );
}

/**
 * Compose the persona sentence the system prompt reads when the user has not
 * written one. Built from whatever voice signal survived analysis so it stays
 * specific rather than generic filler.
 */
export function buildPersona(
  brandLabel: string,
  voice: Partial<BrandAgentVoice> | undefined,
): string {
  const parts = [`You are the content lead for ${brandLabel}.`];

  if (voice?.tone) {
    parts.push(`Write in a ${voice.tone} tone.`);
  }

  if (voice?.style) {
    parts.push(`Voice: ${voice.style}.`);
  }

  const audience = readStringList(voice?.audience);
  if (audience.length > 0) {
    parts.push(`Speak to ${audience.join(', ')}.`);
  }

  const messagingPillars = readStringList(voice?.messagingPillars);
  if (messagingPillars.length > 0) {
    parts.push(`Keep every piece anchored to ${messagingPillars.join(', ')}.`);
  }

  return parts.join(' ');
}

/**
 * Fill the agent-config fields the scrape + voice analysis never produce, without
 * overwriting anything already set.
 *
 * Run *after* `BrandDataMapper.mergeExtractedVoice` so the AI-derived voice and
 * strategy win; this only closes the remaining holes (content types, platforms,
 * cadence, persona, working hours) that otherwise leave the first prompt
 * running against an empty strategy block.
 */
export function buildPrefilledAgentConfig(
  input: BuildPrefilledAgentConfigInput,
): BrandAgentConfig {
  const { brandLabel, existingConfig, scrapedData, timezone } = input;
  const existingStrategy: Partial<BrandAgentStrategy> =
    existingConfig.strategy ?? {};
  const derivedPlatforms = derivePlatformsFromSocialLinks(
    scrapedData?.socialLinks,
  );

  const strategy: Partial<BrandAgentStrategy> = {
    ...existingStrategy,
    contentTypes: hasEntries(existingStrategy.contentTypes)
      ? existingStrategy.contentTypes
      : [...DEFAULT_STRATEGY_CONTENT_TYPES],
    frequency: existingStrategy.frequency || DEFAULT_STRATEGY_FREQUENCY,
    platforms: hasEntries(existingStrategy.platforms)
      ? existingStrategy.platforms
      : derivedPlatforms,
  };

  return {
    ...existingConfig,
    persona:
      existingConfig.persona || buildPersona(brandLabel, existingConfig.voice),
    schedule: {
      activeDays: [...DEFAULT_ACTIVE_DAYS],
      endTime: '18:00',
      startTime: '09:00',
      ...(timezone ? { timezone } : {}),
      ...(existingConfig.schedule ?? {}),
    },
    strategy,
  };
}
