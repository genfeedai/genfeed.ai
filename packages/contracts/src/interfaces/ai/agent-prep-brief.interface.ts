/**
 * Where a fact in a prep brief comes from. Every fact carries one, so a reader
 * can open the exact record behind a line. Items carry ids, not URLs: the
 * server does not know the org and brand slugs, so the client builds the link.
 */
export type AgentPrepBriefCitation =
  | {
      kind: 'knowledge';
      sourceId: string;
      title: string;
      version: number;
      versionId: string;
    }
  | {
      kind: 'memory';
      memoryId: string;
      /** The revision that was read; absent for a memory with no revision yet. */
      revisionId?: string;
    }
  | {
      kind: 'post';
      platform: string | null;
      postId: string;
    }
  | {
      kind: 'analytics';
      /** Last day (ISO 8601) of the window the figures cover. */
      endsAt: string;
      /** Posts the figures add up, best first, at most five. */
      postIds: string[];
      /** First day (ISO 8601) of the window the figures cover. */
      startsAt: string;
    };

export const AGENT_PREP_BRIEF_SECTIONS = [
  'knowledge',
  'memory',
  'performance',
  'recent_posts',
] as const;

export type AgentPrepBriefSection = (typeof AGENT_PREP_BRIEF_SECTIONS)[number];

/** A statement the stored records support. Never model-written. */
export interface AgentPrepBriefFact {
  citation: AgentPrepBriefCitation;
  /** ISO 8601 time the record says the fact happened, when it records one. */
  occurredAt?: string;
  section: AgentPrepBriefSection;
  text: string;
}

/** Evidence the brief looked for and did not find, or found unusable. */
export interface AgentPrepBriefMissingEvidence {
  reason: string;
  section: AgentPrepBriefSection;
}

/**
 * A follow-up the reader may take. It names an existing destination and never
 * changes anything: edits and publishes still go through their own approval
 * flows.
 */
export interface AgentPrepBriefSuggestion {
  /** A key of the `suggest_next_steps` destinations. */
  destination: string;
  text: string;
}

export interface AgentPrepBrief {
  brandId: string;
  facts: AgentPrepBriefFact[];
  generatedAt: string;
  /** True when a read hit its cap, so the facts may leave out older records. */
  isScanLimited: boolean;
  missingEvidence: AgentPrepBriefMissingEvidence[];
  subject: {
    campaignId?: string;
    campaignName?: string;
    topic?: string;
  };
  suggestions: AgentPrepBriefSuggestion[];
  /** Days of posts and performance the brief covers. */
  windowDays: number;
}
