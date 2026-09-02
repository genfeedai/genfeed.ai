/**
 * Shared character budget for every brand-context contribution supplied to a
 * generation prompt. The budget is applied after all assemblers contribute so
 * no individual assembler can consume a separate 6,000-character allowance.
 */
export const BRAND_CONTEXT_CHARACTER_BUDGET = 6000;

type BudgetSection = {
  content: string;
  priority: number;
};

const TRUNCATION_PRIORITY = {
  rag: 0,
  recentPosts: 1,
  historicalPerformance: 2,
  general: 3,
  customInstructions: 4,
  guardrails: 5,
  brandVoice: 6,
} as const;

const SECTION_HEADER_PATTERN = /^(?:##\s+.+|[A-Z][A-Z ]+:)$/;

function readTruncationPriority(header: string): number {
  if (header === '## Relevant Knowledge') {
    return TRUNCATION_PRIORITY.rag;
  }
  if (header === '## Recent Posts (avoid repetition)') {
    return TRUNCATION_PRIORITY.recentPosts;
  }
  if (
    header === '## Historical Performance Context' ||
    header === '## Historical Anti-Patterns' ||
    header === '## Performance Insights'
  ) {
    return TRUNCATION_PRIORITY.historicalPerformance;
  }
  if (header === '## Custom Instructions' || header === 'SYSTEM DIRECTIVES:') {
    return TRUNCATION_PRIORITY.customInstructions;
  }
  if (header === '## Brand Guidelines' || header === 'GUARDRAILS:') {
    return TRUNCATION_PRIORITY.guardrails;
  }
  if (
    header === '## Brand Voice' ||
    header === '## Voice Example' ||
    header === '## Reference Exemplars' ||
    header === 'STYLE DIRECTIVES:'
  ) {
    return TRUNCATION_PRIORITY.brandVoice;
  }

  return TRUNCATION_PRIORITY.general;
}

function splitContributionIntoSections(contribution: string): BudgetSection[] {
  const lines = contribution.trim().split('\n');
  const sections: BudgetSection[] = [];
  let currentLines: string[] = [];
  let currentPriority: number = TRUNCATION_PRIORITY.general;

  const flush = (): void => {
    const content = currentLines.join('\n').trim();
    if (content) {
      sections.push({ content, priority: currentPriority });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (SECTION_HEADER_PATTERN.test(trimmedLine)) {
      flush();
      currentPriority = readTruncationPriority(trimmedLine);
    }
    currentLines.push(line);
  }
  flush();

  return sections;
}

function renderSections(sections: BudgetSection[]): string {
  return sections
    .map((section) => section.content)
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Fits assembled brand context to one budget. Sections are reduced in this
 * deterministic order: RAG, recent posts, historical performance, general
 * context, custom instructions, guardrails, then brand voice. Within the same
 * priority, later sections are reduced first so contribution order is stable.
 */
export function fitBrandContextToBudget(
  contributions: ReadonlyArray<string | null | undefined>,
  maxLength = BRAND_CONTEXT_CHARACTER_BUDGET,
): string {
  const sections = contributions
    .filter((contribution): contribution is string => Boolean(contribution))
    .flatMap(splitContributionIntoSections);

  if (!Number.isFinite(maxLength)) {
    return renderSections(sections);
  }

  const normalizedMaxLength = Math.max(0, Math.floor(maxLength));
  let rendered = renderSections(sections);
  if (rendered.length <= normalizedMaxLength) {
    return rendered;
  }

  const priorities = Array.from(
    new Set(sections.map((section) => section.priority)),
  ).sort((left, right) => left - right);

  for (const priority of priorities) {
    for (let index = sections.length - 1; index >= 0; index--) {
      const section = sections[index];
      if (section.priority !== priority) {
        continue;
      }

      const overflow = rendered.length - normalizedMaxLength;
      if (overflow <= 0) {
        return rendered;
      }

      section.content = section.content.slice(0, -overflow).trimEnd();
      rendered = renderSections(sections);
    }
  }

  return rendered.slice(0, normalizedMaxLength).trimEnd();
}
