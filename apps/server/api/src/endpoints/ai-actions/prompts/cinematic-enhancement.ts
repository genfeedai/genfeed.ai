import {
  CINEMATIC_LEXICON,
  type CinematicLexiconCategory,
  type CinematicTechnique,
} from '@api/endpoints/ai-actions/prompts/cinematic-lexicon';
import { PromptCategory } from '@genfeedai/enums';

export const ENHANCE_PROMPT_BASE = `You are an expert at writing prompts for AI image and video generation models. Enhance the user's prompt to be more detailed, descriptive, and effective for AI generation. Add specific details about lighting, composition, style, mood, and technical aspects. Return ONLY the enhanced prompt text, nothing else.`;

const CINEMATIC_PROMPT_CATEGORIES: ReadonlySet<string> = new Set([
  PromptCategory.MODELS_PROMPT_IMAGE,
  PromptCategory.MODELS_PROMPT_VIDEO,
  PromptCategory.PRESET_DESCRIPTION_IMAGE,
  PromptCategory.PRESET_DESCRIPTION_VIDEO,
]);

const CATEGORY_HEADINGS: Record<CinematicLexiconCategory, string> = {
  'camera-movement': 'Camera movement',
  'editing-transitions': 'Editing and transitions',
  'framing-composition': 'Framing and composition',
  lighting: 'Lighting',
  'stylistic-effects': 'Stylistic effects',
};

export interface ResolveEnhancePromptSystemPromptOptions {
  category?: string;
  loadGuidance?: () => string;
}

export function isCinematicPromptCategory(
  category: string | undefined,
): boolean {
  if (!category) {
    return false;
  }
  return CINEMATIC_PROMPT_CATEGORIES.has(category);
}

export function formatCinematicLexiconGuidance(
  lexicon: readonly CinematicTechnique[] = CINEMATIC_LEXICON,
): string {
  const grouped = new Map<CinematicLexiconCategory, CinematicTechnique[]>();
  for (const entry of lexicon) {
    const bucket = grouped.get(entry.category) ?? [];
    bucket.push(entry);
    grouped.set(entry.category, bucket);
  }

  const sections: string[] = [];
  for (const [category, heading] of Object.entries(CATEGORY_HEADINGS) as Array<
    [CinematicLexiconCategory, string]
  >) {
    const entries = grouped.get(category) ?? [];
    if (entries.length === 0) {
      continue;
    }
    const lines = entries.map(
      (entry) =>
        `- ${entry.name}: ${entry.definition} When to use: ${entry.whenToUse}`,
    );
    sections.push(`${heading}:\n${lines.join('\n')}`);
  }

  return [
    'Cinematography vocabulary (use only these named techniques; never invent camera jargon that is not listed):',
    sections.join('\n\n'),
    'Rewriting rules:',
    '- Translate naive spatial or mood words into the closest lexicon term.',
    '- Preserve the user subject, characters, and named references verbatim.',
    '- Do not bury the original intent under extra plot or new objects.',
    'Draft-resolution testing: validate a prompt with 2–3 cheap waves at low resolution on the full-quality model; never switch to a mini variant for drafts.',
    'Corrective feedback grammar: Problem → Goal → Correction. Never give bare dislike as direction.',
  ].join('\n\n');
}

export function loadCinematicLexiconModule(): readonly CinematicTechnique[] {
  return CINEMATIC_LEXICON;
}

export function loadCinematicLexiconGuidance(
  loader: () => readonly CinematicTechnique[] = loadCinematicLexiconModule,
): string {
  try {
    const lexicon = loader();
    if (!lexicon || lexicon.length === 0) {
      return '';
    }
    return formatCinematicLexiconGuidance(lexicon);
  } catch {
    return '';
  }
}

export function resolveEnhancePromptSystemPrompt(
  options: ResolveEnhancePromptSystemPromptOptions = {},
): string {
  const { category, loadGuidance = loadCinematicLexiconGuidance } = options;
  const shouldIncludeLexicon =
    category === undefined || isCinematicPromptCategory(category);

  if (!shouldIncludeLexicon) {
    return ENHANCE_PROMPT_BASE;
  }

  let guidance = '';
  try {
    guidance = loadGuidance();
  } catch {
    return ENHANCE_PROMPT_BASE;
  }

  if (!guidance) {
    return ENHANCE_PROMPT_BASE;
  }

  return `${ENHANCE_PROMPT_BASE}\n\n${guidance}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sortAliasesLongestFirst(
  aliases: readonly string[],
): readonly string[] {
  return [...aliases].sort((left, right) => right.length - left.length);
}

/**
 * Deterministic vocabulary rewrite used by enhancement tests and as the
 * mapping the system prompt describes. Replaces naive spatial/mood phrases
 * with the closest lexicon term and leaves named subjects untouched.
 */
export function translateNaiveCinematicLanguage(prompt: string): string {
  let rewritten = prompt;
  const applied = new Set<string>();

  const techniques = [...CINEMATIC_LEXICON].sort((left, right) => {
    const leftMax = Math.max(0, ...left.aliases.map((alias) => alias.length));
    const rightMax = Math.max(0, ...right.aliases.map((alias) => alias.length));
    return rightMax - leftMax;
  });

  for (const technique of techniques) {
    for (const alias of sortAliasesLongestFirst(technique.aliases)) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi');
      if (!pattern.test(rewritten)) {
        continue;
      }
      pattern.lastIndex = 0;
      rewritten = rewritten.replace(pattern, () => {
        if (applied.has(technique.name)) {
          return technique.name;
        }
        applied.add(technique.name);
        return technique.name;
      });
    }
  }

  return rewritten.replace(/\s+/g, ' ').trim();
}
