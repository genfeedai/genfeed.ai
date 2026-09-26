import { ModerationCategory } from '@genfeedai/contracts';
import type { ModerationScores } from '@genfeedai/contracts/api-types/contracts';
import type { IModerationProvider } from '@genfeedai/contracts/interfaces';
import OpenAI from 'openai';
import type { ModerationMultiModalInput } from 'openai/resources/moderations';

export const OPENAI_MODERATION_MODEL = 'omni-moderation-latest';

/** Transcripts are classified in chunks; the verdict takes the max. */
const MAX_TEXT_CHUNK = 10_000;

/**
 * OpenAI label → Genfeed category. Several vendor labels fold into one
 * category and the category takes their maximum. `illicit` covers wrongdoing
 * advice, of which drugs are the dominant case; `illicit/violent` is weapons
 * procurement. OpenAI has no spam label, so `spam` is never scored here.
 */
const CATEGORY_BY_LABEL: Readonly<Record<string, ModerationCategory>> = {
  harassment: ModerationCategory.HARASSMENT,
  'harassment/threatening': ModerationCategory.HARASSMENT,
  hate: ModerationCategory.HATE,
  'hate/threatening': ModerationCategory.HATE,
  illicit: ModerationCategory.DRUGS,
  'illicit/violent': ModerationCategory.WEAPONS,
  'self-harm': ModerationCategory.SELF_HARM,
  'self-harm/instructions': ModerationCategory.SELF_HARM,
  'self-harm/intent': ModerationCategory.SELF_HARM,
  sexual: ModerationCategory.SEXUAL,
  'sexual/minors': ModerationCategory.SEXUAL_MINORS,
  violence: ModerationCategory.VIOLENCE,
  'violence/graphic': ModerationCategory.GRAPHIC,
};

type OpenAiModerationResult = {
  category_applied_input_types?: object;
  category_scores: object;
};

/**
 * Map one OpenAI result onto Genfeed categories. A label OpenAI did not apply
 * to this input type (most labels are text-only) is left out, so an image
 * never reads as "0% hate" when it was never scored for hate.
 */
export function toModerationScores(
  result: OpenAiModerationResult,
  inputType: 'image' | 'text',
): ModerationScores {
  const scores: ModerationScores = {};
  for (const [label, rawScore] of Object.entries(result.category_scores)) {
    const category = CATEGORY_BY_LABEL[label];
    const appliedTo: unknown = result.category_applied_input_types
      ? Object.getOwnPropertyDescriptor(
          result.category_applied_input_types,
          label,
        )?.value
      : undefined;
    if (
      !category ||
      typeof rawScore !== 'number' ||
      !Number.isFinite(rawScore) ||
      (Array.isArray(appliedTo) && !appliedTo.includes(inputType))
    ) {
      continue;
    }
    const score = Math.min(1, Math.max(0, rawScore));
    scores[category] = Math.max(scores[category] ?? 0, score);
  }
  return scores;
}

function mergeMax(all: readonly ModerationScores[]): ModerationScores {
  const merged: ModerationScores = {};
  for (const scores of all) {
    for (const [category, score] of Object.entries(scores) as [
      ModerationCategory,
      number | undefined,
    ][]) {
      if (score !== undefined) {
        merged[category] = Math.max(merged[category] ?? 0, score);
      }
    }
  }
  return merged;
}

/**
 * Hosted moderation through OpenAI `omni-moderation-latest` (#4880): images
 * and text in one model. Customer media leaves the host only when an operator
 * sets MODERATION_PROVIDER=openai; the call carries the asset's CDN URL, not
 * its bytes.
 */
export class OpenAiModerationProvider implements IModerationProvider {
  readonly name = 'openai' as const;
  readonly isEnabled: boolean;
  private readonly client: OpenAI | null;

  constructor(apiKey: string | undefined) {
    this.isEnabled = Boolean(apiKey);
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async classifyImage(url: string): Promise<ModerationScores> {
    const [result] = await this.create([
      { image_url: { url }, type: 'image_url' },
    ]);
    return toModerationScores(result, 'image');
  }

  async classifyFrames(urls: readonly string[]): Promise<ModerationScores[]> {
    const scores: ModerationScores[] = [];
    // One image per request: the endpoint scores a multimodal request as a
    // single result, which would blur which frame triggered.
    for (const url of urls) {
      scores.push(await this.classifyImage(url));
    }
    return scores;
  }

  async classifyText(text: string): Promise<ModerationScores> {
    const chunks: string[] = [];
    for (let start = 0; start < text.length; start += MAX_TEXT_CHUNK) {
      chunks.push(text.slice(start, start + MAX_TEXT_CHUNK));
    }
    if (chunks.length === 0) {
      return {};
    }
    const results = await this.create(
      chunks.map((chunk) => ({ text: chunk, type: 'text' as const })),
    );
    return mergeMax(
      results.map((result) => toModerationScores(result, 'text')),
    );
  }

  private async create(
    input: ModerationMultiModalInput[],
  ): Promise<OpenAiModerationResult[]> {
    if (!this.client) {
      throw new Error('OPENAI_API_KEY is not configured for moderation');
    }
    const response = await this.client.moderations.create({
      input,
      model: OPENAI_MODERATION_MODEL,
    });
    return response.results;
  }
}
