import type {
  BrandContextBudgetPriority,
  BrandContextBudgetResult,
  BrandContextBudgetSectionReport,
} from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';

/**
 * Shared character budget for every brand-context contribution supplied to a
 * generation prompt. The budget is applied after all assemblers contribute so
 * no individual assembler can consume a separate 6,000-character allowance.
 */
export const BRAND_CONTEXT_CHARACTER_BUDGET = 6000;

/** Header of the saved-memory retrieval section (lowest budget priority). */
export const RETRIEVED_BRAND_MEMORY_HEADER = '## Retrieved Brand Memory';
/** Header of the authoritative BRAND_TRUTH Knowledge section. */
export const BRAND_KNOWLEDGE_HEADER = '## Brand Knowledge';

type BudgetSection = {
  content: string;
  header: string;
  originalLength: number;
  priority: BrandContextBudgetPriority;
};

/** Reduction order: lower ranks are trimmed first. */
const PRIORITY_RANK: Record<BrandContextBudgetPriority, number> = {
  rag: 0,
  recentPosts: 1,
  historicalPerformance: 2,
  brandKnowledge: 3,
  general: 4,
  customInstructions: 5,
  guardrails: 6,
  brandVoice: 7,
};

const SECTION_HEADER_PATTERN = /^(?:##\s+.+|[A-Z][A-Z ]+:)$/;

function readTruncationPriority(header: string): BrandContextBudgetPriority {
  if (header === RETRIEVED_BRAND_MEMORY_HEADER) {
    return 'rag';
  }
  if (header === '## Recent Posts (avoid repetition)') {
    return 'recentPosts';
  }
  if (
    header === '## Historical Performance Context' ||
    header === '## Historical Anti-Patterns' ||
    header === '## Performance Insights'
  ) {
    return 'historicalPerformance';
  }
  if (header === BRAND_KNOWLEDGE_HEADER) {
    return 'brandKnowledge';
  }
  if (header === '## Custom Instructions' || header === 'SYSTEM DIRECTIVES:') {
    return 'customInstructions';
  }
  if (header === '## Brand Guidelines' || header === 'GUARDRAILS:') {
    return 'guardrails';
  }
  if (
    header === '## Brand Voice' ||
    header === '## Voice Example' ||
    header === '## Reference Exemplars' ||
    header === 'STYLE DIRECTIVES:'
  ) {
    return 'brandVoice';
  }

  return 'general';
}

function splitContributionIntoSections(contribution: string): BudgetSection[] {
  const lines = contribution.trim().split('\n');
  const sections: BudgetSection[] = [];
  let currentLines: string[] = [];
  let currentHeader = '';
  let currentPriority: BrandContextBudgetPriority = 'general';

  const flush = (): void => {
    const content = currentLines.join('\n').trim();
    if (content) {
      sections.push({
        content,
        header: currentHeader || (content.split('\n', 1)[0] ?? '').trim(),
        originalLength: content.length,
        priority: currentPriority,
      });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (SECTION_HEADER_PATTERN.test(trimmedLine)) {
      flush();
      currentHeader = trimmedLine;
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

function toSectionReports(
  sections: BudgetSection[],
): BrandContextBudgetSectionReport[] {
  return sections.map((section) => {
    const renderedLength = section.content.length;
    return {
      header: section.header,
      originalLength: section.originalLength,
      priority: section.priority,
      renderedLength,
      status:
        renderedLength === 0
          ? 'dropped'
          : renderedLength < section.originalLength
            ? 'trimmed'
            : 'kept',
    };
  });
}

/**
 * Fits assembled brand context to one budget and reports what happened to
 * every section. Sections are reduced in this deterministic order: retrieved
 * brand memory, recent posts, historical performance, brand Knowledge,
 * general context, custom instructions, guardrails, then brand voice. Within
 * the same priority, later sections are reduced first so contribution order
 * is stable.
 */
export function fitBrandContextToBudgetWithReport(
  contributions: ReadonlyArray<string | null | undefined>,
  maxLength = BRAND_CONTEXT_CHARACTER_BUDGET,
): BrandContextBudgetResult {
  const sections = contributions
    .filter((contribution): contribution is string => Boolean(contribution))
    .flatMap(splitContributionIntoSections);
  const untrimmed = renderSections(sections);

  if (!Number.isFinite(maxLength)) {
    return {
      isTrimmed: false,
      maxLength: null,
      sections: toSectionReports(sections),
      text: untrimmed,
      untrimmedLength: untrimmed.length,
    };
  }

  const normalizedMaxLength = Math.max(0, Math.floor(maxLength));
  const finish = (text: string): BrandContextBudgetResult => ({
    isTrimmed: text.length < untrimmed.length,
    maxLength: normalizedMaxLength,
    sections: toSectionReports(sections),
    text,
    untrimmedLength: untrimmed.length,
  });

  let rendered = untrimmed;
  if (rendered.length <= normalizedMaxLength) {
    return finish(rendered);
  }

  const priorities = Array.from(
    new Set(sections.map((section) => section.priority)),
  ).sort((left, right) => PRIORITY_RANK[left] - PRIORITY_RANK[right]);

  for (const priority of priorities) {
    for (let index = sections.length - 1; index >= 0; index--) {
      const section = sections[index];
      if (section.priority !== priority) {
        continue;
      }

      const overflow = rendered.length - normalizedMaxLength;
      if (overflow <= 0) {
        return finish(rendered);
      }

      section.content = section.content.slice(0, -overflow).trimEnd();
      rendered = renderSections(sections);
    }
  }

  return finish(rendered.slice(0, normalizedMaxLength).trimEnd());
}

/** Text-only form of {@link fitBrandContextToBudgetWithReport}. */
export function fitBrandContextToBudget(
  contributions: ReadonlyArray<string | null | undefined>,
  maxLength = BRAND_CONTEXT_CHARACTER_BUDGET,
): string {
  return fitBrandContextToBudgetWithReport(contributions, maxLength).text;
}
