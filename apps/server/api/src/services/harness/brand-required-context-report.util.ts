import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import type { BrandContextContribution } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';

/** Brand Kit field that each key of the identity and voice objects is saved from. */
const BRAND_KIT_FIELD_BY_SNAPSHOT_KEY: Readonly<Record<string, string>> = {
  audience: 'voiceAudience',
  avoid: 'voiceDoNotSoundLike',
  guidelines: 'promptGuidelines',
  messagingPillars: 'voiceMessagingPillars',
  name: 'label',
  sample: 'voiceSampleOutput',
  style: 'voiceStyle',
  tone: 'voiceTone',
  values: 'voiceValues',
};

const LARGEST_FIELDS_NAMED = 3;

interface BrandRequiredContextField {
  /** Brand Kit field name, or the section header for rules sections. */
  field: string;
  characters: number;
}

export interface BrandRequiredContextReport {
  requiredCharacters: number;
  maxCharacters: number;
  overflowCharacters: number;
  /** Largest first. */
  fields: BrandRequiredContextField[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldsOf(
  contribution: BrandContextContribution,
): BrandRequiredContextField[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contribution.content);
  } catch {
    parsed = undefined;
  }
  if (!isPlainObject(parsed)) {
    return [
      { characters: contribution.content.length, field: contribution.header },
    ];
  }
  return Object.entries(parsed).map(([key, value]) => ({
    characters: JSON.stringify(value).length,
    field: BRAND_KIT_FIELD_BY_SNAPSHOT_KEY[key] ?? key,
  }));
}

/**
 * Splits the required brand context into the Brand Kit fields that fill it, so
 * a refusal can say which field to shorten and by how much.
 */
export function buildBrandRequiredContextReport(
  required: readonly BrandContextContribution[],
  requiredCharacters: number,
  maxCharacters: number = BRAND_CONTEXT_CHARACTER_BUDGET,
): BrandRequiredContextReport {
  return {
    fields: required
      .flatMap(fieldsOf)
      .filter((entry) => entry.characters > 0)
      .sort((left, right) => right.characters - left.characters),
    maxCharacters,
    overflowCharacters: Math.max(0, requiredCharacters - maxCharacters),
    requiredCharacters,
  };
}

/** One sentence for a person: the numbers, the longest fields, what to do. */
export function formatBrandRequiredContextOverflow(
  report: BrandRequiredContextReport,
): string {
  const longest = report.fields
    .slice(0, LARGEST_FIELDS_NAMED)
    .map(
      (entry) =>
        `${entry.field} (${entry.characters.toLocaleString('en-US')} characters)`,
    )
    .join(', ');
  return `The Brand Kit text a generation must carry is ${report.requiredCharacters.toLocaleString('en-US')} characters and the limit is ${report.maxCharacters.toLocaleString('en-US')}, so it is ${report.overflowCharacters.toLocaleString('en-US')} too long. Shorten the longest fields${longest ? `: ${longest}` : ''}.`;
}
