import type { BrandAgentConfig } from '@api/collections/brands/schemas/brand.schema';
import type { IScrapedBrandData } from '@genfeedai/contracts/interfaces';

import { readStringList } from './string-list.util';

/**
 * Placeholder copy written by `UserSetupService.getOrCreateBrand`. It reads as
 * real content to every prompt builder, so it has to be recognised and replaced
 * rather than merged with.
 */
export const PLACEHOLDER_BRAND_DESCRIPTION =
  'Default description. Use it as a pre-prompt';

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function isPlaceholderBrandText(value?: string | null): boolean {
  const normalized = value?.trim();

  return !normalized || normalized === PLACEHOLDER_BRAND_DESCRIPTION;
}

/**
 * Compose `brand.text` — the pre-prompt every generation prepends — when the
 * scrape produced no tagline or about copy for
 * `BrandPersistenceService.updateBrandWithScrapedData` to build one from.
 *
 * Without this, a brand whose site scraped thin (or whose signup email had no
 * corporate domain at all) reaches the user's first prompt with an empty
 * pre-prompt, and the model has nothing to be on-brand about.
 */
export function buildBrandSystemPrompt(
  brandLabel: string,
  agentConfig: BrandAgentConfig,
  scrapedData?: IScrapedBrandData,
): string {
  const voice = agentConfig.voice ?? {};
  const strategy = agentConfig.strategy ?? {};
  const parts = [`You are creating content for ${brandLabel}.`];

  const description =
    readString(scrapedData?.description) ?? readString(scrapedData?.heroText);
  if (description) {
    parts.push(`About the brand: ${description}`);
  }

  const tagline = readString(scrapedData?.tagline);
  if (tagline) {
    parts.push(`Brand tagline: "${tagline}"`);
  }

  const tone = readString(voice.tone);
  const style = readString(voice.style);
  if (tone || style) {
    parts.push(
      `Voice: ${[tone, style].filter(Boolean).join(', ')}. Match it in every piece.`,
    );
  }

  const audience = readStringList(voice.audience);
  if (audience.length > 0) {
    parts.push(`Audience: ${audience.join(', ')}.`);
  }

  const pillars = readStringList(voice.messagingPillars);
  if (pillars.length > 0) {
    parts.push(`Messaging pillars: ${pillars.join(', ')}.`);
  }

  const valuePropositions = readStringList(scrapedData?.valuePropositions);
  if (valuePropositions.length > 0) {
    parts.push(`What the brand promises: ${valuePropositions.join('; ')}.`);
  }

  const platforms = readStringList(strategy.platforms);
  if (platforms.length > 0) {
    parts.push(`Primary channels: ${platforms.join(', ')}.`);
  }

  const bannedPhrases = readStringList(voice.bannedPhrases);
  if (bannedPhrases.length > 0) {
    parts.push(`Never use: ${bannedPhrases.join(', ')}.`);
  }

  return parts.join('\n\n');
}
