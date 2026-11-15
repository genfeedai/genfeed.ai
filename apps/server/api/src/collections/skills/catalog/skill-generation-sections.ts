import type { SkillSectionReceipt } from '@genfeedai/contracts/interfaces/ai';

/**
 * Compiles a skill's instructions into the short, per-modality part that
 * steers a generation prompt. A media prompt gets those sections, not the
 * whole `SKILL.md`; agent turns that ask for a skill still get the full body.
 *
 * A section is a `## ` heading and everything under it, including `###`
 * children. A skill is never cut mid-text: a section is in or out.
 */
const GENERATION_SECTIONS_COMPILER_VERSION = 'generation-sections-v1';

type GenerationModality = 'audio' | 'image' | 'video';

/**
 * Most characters of skill text one generation prompt may carry, by modality.
 * Any other modality (text) takes the legacy per-turn total.
 */
const GENERATION_SKILL_BUDGET: Readonly<
  Record<GenerationModality | 'text', number>
> = {
  audio: 12_000,
  image: 24_000,
  text: 48_000,
  video: 24_000,
};

export function generationSkillBudget(modality: string | undefined): number {
  return isGenerationModality(modality)
    ? GENERATION_SKILL_BUDGET[modality]
    : GENERATION_SKILL_BUDGET.text;
}

function isGenerationModality(
  modality: string | undefined,
): modality is GenerationModality {
  return modality === 'audio' || modality === 'image' || modality === 'video';
}

type SectionPlan = Partial<Record<GenerationModality, readonly string[]>>;

/**
 * The headings of a first-party skill that steer a prompt, per modality.
 * Headings are matched whole and case-insensitively. A test pins every
 * heading to the shipped catalog, so a skill update that renames one fails
 * there instead of silently dropping its text.
 */
export const GENERATION_SECTION_PLANS: Readonly<Record<string, SectionPlan>> = {
  'cinematic-prompting': {
    image: [
      'Rewriting rules',
      'Framing and composition',
      'Lighting',
      'Stylistic effects',
      'Naive to technical examples',
      'Output',
    ],
    video: [
      'Rewriting rules',
      'Draft-resolution testing',
      'Corrective feedback grammar',
      'Camera movement',
      'Framing and composition',
      'Lighting',
      'Editing and transitions',
      'Naive to technical examples',
      'Output',
    ],
  },
  'image-prompt-engineer': {
    image: [
      'Prompt Structure Hierarchy',
      'Model-Specific Prompt Optimization',
      'Style Presets',
      'Negative Prompt Guidance',
      'Aspect Ratio Guide',
      'Output Format',
    ],
    video: [
      'Prompt Structure Hierarchy',
      'Short Video Prompt Structure',
      'Aspect Ratio Guide',
      'Output Format',
    ],
  },
  'model-selector': {
    audio: [
      'Decision Framework',
      'Music and Audio Model Matrix',
      'Recommendation Output Format',
    ],
    image: [
      'Decision Framework',
      'Image Model Decision Matrix',
      'Recommendation Output Format',
    ],
    video: [
      'Decision Framework',
      'Video Model Decision Matrix',
      'Recommendation Output Format',
    ],
  },
  'prompt-generator': {
    image: [
      'Core Principles',
      'Style Settings System',
      'Category-Specific Guidance',
      'Image Prompt Structure',
      'Output Format',
      'Instructions',
    ],
    video: [
      'Core Principles',
      'Category-Specific Guidance',
      'Video Prompt Structure',
      'Output Format',
      'Instructions',
    ],
  },
};

const REFERENCED_HEADING = /^Referenced:\s*(.+)$/u;
const SECTION_HEADING = /^##\s+(.+?)\s*$/u;
const FENCE = /^(```|~~~)/u;
/** Intro text above the first heading is kept only while it stays short. */
const MAX_PREAMBLE_CHARACTERS = 1_500;
const SECTION_SEPARATOR = '\n\n';

interface SkillSection {
  heading: string;
  text: string;
}

interface ParsedSkillSections {
  preamble: string;
  sections: SkillSection[];
}

/** Splits instructions at `## ` headings, ignoring headings inside code fences. */
export function parseSkillSections(instructions: string): ParsedSkillSections {
  const preamble: string[] = [];
  const sections: { heading: string; lines: string[] }[] = [];
  let isFenced = false;

  for (const line of instructions.split('\n')) {
    if (FENCE.test(line)) isFenced = !isFenced;
    const heading = isFenced ? null : SECTION_HEADING.exec(line);
    if (heading) {
      sections.push({ heading: heading[1], lines: [line] });
      continue;
    }
    (sections.at(-1)?.lines ?? preamble).push(line);
  }

  return {
    preamble: preamble.join('\n').trim(),
    sections: sections.map(({ heading, lines }) => ({
      heading,
      text: lines.join('\n').trim(),
    })),
  };
}

interface CompileGenerationSectionsInput {
  /** Characters this skill may add, header and separators already taken off. */
  budget: number;
  instructions: string;
  modality?: string;
  /** Set only for trusted first-party skills; a custom skill has no plan. */
  planSlug?: string;
}

interface CompiledGenerationSections {
  /** Headings kept, `preamble` for the intro. */
  loaded: string[];
  /** Headings left out because they were off-plan or did not fit. */
  omitted: string[];
  text: string;
}

function referencedFileMentioned(text: string, section: SkillSection): boolean {
  const file = REFERENCED_HEADING.exec(section.heading)?.[1].trim();
  return Boolean(file && text.includes(file));
}

/**
 * Picks the sections of one skill for a modality and keeps them whole.
 *
 * A planned skill takes the headings its plan lists for the modality. Any
 * other skill takes its sections in order for as long as they fit. Files a
 * skill links (`## Referenced: x.md`) load only when a kept section names them.
 */
export function compileGenerationSections(
  input: CompileGenerationSectionsInput,
): CompiledGenerationSections {
  const { preamble, sections } = parseSkillSections(input.instructions);
  const plan = input.planSlug
    ? isGenerationModality(input.modality)
      ? GENERATION_SECTION_PLANS[input.planSlug]?.[input.modality]
      : undefined
    : undefined;
  const planned = plan
    ? new Set(plan.map((heading) => heading.toLowerCase()))
    : undefined;

  const kept: SkillSection[] = [];
  const omitted: string[] = [];
  const parts: string[] = [];
  const loaded: string[] = [];
  let length = 0;
  let isFull = false;

  const take = (heading: string, text: string): boolean => {
    const cost =
      text.length + (parts.length > 0 ? SECTION_SEPARATOR.length : 0);
    if (isFull || length + cost > input.budget) {
      isFull = true;
      omitted.push(heading);
      return false;
    }
    parts.push(text);
    loaded.push(heading);
    length += cost;
    return true;
  };

  if (preamble) {
    if (preamble.length <= MAX_PREAMBLE_CHARACTERS || !planned) {
      take('preamble', preamble);
    } else {
      omitted.push('preamble');
    }
  }

  for (const section of sections) {
    if (REFERENCED_HEADING.test(section.heading)) continue;
    if (planned && !planned.has(section.heading.toLowerCase())) {
      omitted.push(section.heading);
      continue;
    }
    if (take(section.heading, section.text)) kept.push(section);
  }

  for (const section of sections) {
    if (!REFERENCED_HEADING.test(section.heading)) continue;
    if (referencedFileMentioned(parts.join(SECTION_SEPARATOR), section)) {
      take(section.heading, section.text);
    } else {
      omitted.push(section.heading);
    }
  }

  return { loaded, omitted, text: parts.join(SECTION_SEPARATOR) };
}

export function skillSectionReceipt(input: {
  compiled: CompiledGenerationSections;
  contentHash?: string;
  modality?: string;
  slug: string;
  versionId?: string;
}): SkillSectionReceipt {
  return {
    characters: input.compiled.text.length,
    compilerVersion: GENERATION_SECTIONS_COMPILER_VERSION,
    contentHash: input.contentHash,
    loadedSections: input.compiled.loaded,
    modality: input.modality,
    omittedSections: input.compiled.omitted,
    slug: input.slug,
    versionId: input.versionId,
  };
}
