import type { AgentNextStepDestinationKey } from '@api/services/agent-orchestrator/constants/agent-next-step-destinations.constant';
import type {
  AgentPrepBrief,
  AgentPrepBriefFact,
  AgentPrepBriefMissingEvidence,
  AgentPrepBriefSection,
  AgentPrepBriefSuggestion,
} from '@genfeedai/contracts/interfaces';

export const PREP_BRIEF_DEFAULT_WINDOW_DAYS = 30;
export const PREP_BRIEF_MAX_WINDOW_DAYS = 90;
export const PREP_BRIEF_MAX_TOPIC_LENGTH = 200;

const FACT_TEXT_LENGTH = 240;
const POST_PREVIEW_LENGTH = 120;
const MAX_SUGGESTIONS = 5;

/** A Knowledge passage the retrieval returned, with the citation it carries. */
export interface PrepBriefPassage {
  citation: {
    sourceId: string;
    title: string;
    version: number;
    versionId: string;
  };
  content: string;
  occurredAt?: string;
}

export interface PrepBriefMemory {
  content?: string | null;
  createdAt?: Date | null;
  currentRevisionId?: string | null;
  id: string;
  kind?: string | null;
  summary?: string | null;
}

export interface PrepBriefPost {
  description: string;
  id: string;
  platform: string | null;
  publishedAt: Date | null;
}

export interface PrepBriefPerformance {
  comments: number;
  likes: number;
  /** Posts that gained views in the window, most views first, at most five. */
  topPostIds: string[];
  /** Posts that gained any activity in the window. */
  postCount: number;
  shares: number;
  views: number;
}

/** The part of a context-coverage family the brief reads. */
export interface PrepBriefCoverageFamily {
  family: string;
  purpose?: string;
  state: string;
}

export interface PrepBriefInputs {
  brandId: string;
  /** Why Knowledge could not be searched, when the search itself failed. */
  knowledgeError?: string;
  /** The brand's context coverage, when it could be read. */
  knowledgeCoverage?: PrepBriefCoverageFamily[];
  isScanLimited: boolean;
  memories: PrepBriefMemory[];
  now: Date;
  passages: PrepBriefPassage[];
  performance: PrepBriefPerformance | null;
  posts: PrepBriefPost[];
  subject: AgentPrepBrief['subject'];
  windowDays: number;
}

const DAY_MS = 86_400_000;

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function knowledgeFacts(passages: PrepBriefPassage[]): AgentPrepBriefFact[] {
  return passages.flatMap((passage) => {
    const text = clip(passage.content, FACT_TEXT_LENGTH);
    if (!text) return [];
    return [
      {
        citation: {
          kind: 'knowledge' as const,
          sourceId: passage.citation.sourceId,
          title: passage.citation.title,
          version: passage.citation.version,
          versionId: passage.citation.versionId,
        },
        ...(passage.occurredAt ? { occurredAt: passage.occurredAt } : {}),
        section: 'knowledge' as const,
        text,
      },
    ];
  });
}

function memoryFacts(memories: PrepBriefMemory[]): AgentPrepBriefFact[] {
  return memories.flatMap((memory) => {
    const body = clip(memory.summary || memory.content || '', FACT_TEXT_LENGTH);
    if (!body) return [];
    return [
      {
        citation: {
          kind: 'memory' as const,
          memoryId: memory.id,
          ...(memory.currentRevisionId
            ? { revisionId: memory.currentRevisionId }
            : {}),
        },
        ...(memory.createdAt
          ? { occurredAt: memory.createdAt.toISOString() }
          : {}),
        section: 'memory' as const,
        text: memory.kind ? `${memory.kind}: ${body}` : body,
      },
    ];
  });
}

function postFacts(posts: PrepBriefPost[]): AgentPrepBriefFact[] {
  return posts.flatMap((post) => {
    if (!post.publishedAt) return [];
    const preview = clip(post.description, POST_PREVIEW_LENGTH);
    return [
      {
        citation: {
          kind: 'post' as const,
          platform: post.platform,
          postId: post.id,
        },
        occurredAt: post.publishedAt.toISOString(),
        section: 'recent_posts' as const,
        text: `Published on ${post.platform ?? 'a channel'} on ${day(post.publishedAt)}: "${preview}"`,
      },
    ];
  });
}

function performanceFacts(
  performance: PrepBriefPerformance | null,
  now: Date,
  windowDays: number,
): AgentPrepBriefFact[] {
  if (!performance || performance.postCount === 0) return [];
  const startsAt = new Date(now.getTime() - windowDays * DAY_MS);
  return [
    {
      citation: {
        endsAt: day(now),
        kind: 'analytics',
        postIds: performance.topPostIds.slice(0, 5),
        startsAt: day(startsAt),
      },
      section: 'performance',
      text: `From ${day(startsAt)} to ${day(now)}, ${performance.postCount} ${performance.postCount === 1 ? 'post' : 'posts'} drew ${performance.views} views, ${performance.likes} likes, ${performance.comments} comments and ${performance.shares} shares.`,
    },
  ];
}

/** Coverage states that mean the evidence behind a section is not whole. */
function coverageGaps(
  families: PrepBriefCoverageFamily[] | undefined,
): AgentPrepBriefMissingEvidence[] {
  if (!families) return [];
  return families.flatMap((family) => {
    if (family.state === 'available') return [];
    const section: AgentPrepBriefSection =
      family.family === 'knowledge' ? 'knowledge' : 'performance';
    const label =
      family.family === 'knowledge'
        ? `${family.purpose ? `${family.purpose} ` : ''}Knowledge`
        : 'Connected social accounts';
    return [{ reason: `${label} is ${family.state}.`, section }];
  });
}

function missingEvidence(
  input: PrepBriefInputs,
  facts: AgentPrepBriefFact[],
): AgentPrepBriefMissingEvidence[] {
  const has = (section: AgentPrepBriefSection) =>
    facts.some((fact) => fact.section === section);
  const missing: AgentPrepBriefMissingEvidence[] = [];
  if (!has('knowledge')) {
    missing.push({
      reason:
        input.knowledgeError ??
        'No saved Knowledge matched this subject. That does not prove none exists.',
      section: 'knowledge',
    });
  }
  if (!has('memory')) {
    missing.push({
      reason: 'No memory for this brand matched this subject.',
      section: 'memory',
    });
  }
  if (!has('recent_posts')) {
    missing.push({
      reason: `No post was published in the last ${input.windowDays} days.`,
      section: 'recent_posts',
    });
  }
  if (!has('performance')) {
    missing.push({
      reason: `No performance figures were recorded in the last ${input.windowDays} days.`,
      section: 'performance',
    });
  }
  const gaps = coverageGaps(input.knowledgeCoverage);
  const seen = new Set(
    missing.map((entry) => `${entry.section}:${entry.reason}`),
  );
  for (const gap of gaps) {
    const key = `${gap.section}:${gap.reason}`;
    if (!seen.has(key)) {
      seen.add(key);
      missing.push(gap);
    }
  }
  return missing;
}

const SUGGESTION_BY_SECTION: Record<
  AgentPrepBriefSection,
  AgentPrepBriefSuggestion & { destination: AgentNextStepDestinationKey }
> = {
  knowledge: {
    destination: 'knowledge',
    text: 'Add or refresh Knowledge sources for this subject.',
  },
  memory: {
    destination: 'agent',
    text: 'Tell the agent what it should remember about this brand.',
  },
  performance: {
    destination: 'connect_accounts',
    text: 'Check that the social accounts are connected so performance can be recorded.',
  },
  recent_posts: {
    destination: 'calendar',
    text: 'Plan the next posts on the content calendar.',
  },
};

/** Follow-ups come from the gaps only; they point at a destination and change nothing. */
function suggestions(
  missing: AgentPrepBriefMissingEvidence[],
): AgentPrepBriefSuggestion[] {
  const seen = new Set<string>();
  return missing
    .flatMap((entry) => {
      const suggestion = SUGGESTION_BY_SECTION[entry.section];
      if (seen.has(suggestion.destination)) return [];
      seen.add(suggestion.destination);
      return [suggestion];
    })
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Assembles the brief from records already read. Every fact is a statement a
 * stored record supports and carries its citation; nothing is written by a
 * model. What the records could not support is listed as missing evidence
 * instead of being filled in.
 */
export function assemblePrepBrief(input: PrepBriefInputs): AgentPrepBrief {
  const facts = [
    ...knowledgeFacts(input.passages),
    ...memoryFacts(input.memories),
    ...postFacts(input.posts),
    ...performanceFacts(input.performance, input.now, input.windowDays),
  ];
  const missing = missingEvidence(input, facts);
  return {
    brandId: input.brandId,
    facts,
    generatedAt: input.now.toISOString(),
    isScanLimited: input.isScanLimited,
    missingEvidence: missing,
    subject: input.subject,
    suggestions: suggestions(missing),
    windowDays: input.windowDays,
  };
}
