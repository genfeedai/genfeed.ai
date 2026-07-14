import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import { AgentStrategyReportType } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import type { ContentDraftDocument } from '@api/collections/content-drafts/schemas/content-draft.schema';

export const DEFAULT_EVENT_OPPORTUNITY_COST = 12;
export const DEFAULT_IMAGE_OPPORTUNITY_COST = 24;
export const DEFAULT_TEXT_OPPORTUNITY_COST = 10;

export function documentId(entity: unknown): string {
  return String((entity as Record<string, unknown>).id);
}

export function opportunityId(
  opportunity: AgentStrategyOpportunityDocument,
): string {
  return documentId(opportunity);
}

export function draftId(draft: ContentDraftDocument): string {
  return documentId(draft);
}

export function strategyId(strategy: AgentStrategyDocument): string {
  return documentId(strategy);
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function strategyOrganizationId(
  strategy: AgentStrategyDocument,
): string {
  return (
    asOptionalString((strategy as Record<string, unknown>).organizationId) ??
    strategy.organization
  );
}

export function strategyBrandId(
  strategy: AgentStrategyDocument,
): string | undefined {
  return (
    asOptionalString((strategy as Record<string, unknown>).brandId) ??
    strategy.brand ??
    undefined
  );
}

export function strategyPlatforms(strategy: AgentStrategyDocument): string[] {
  return strategy.platforms?.length ? strategy.platforms : ['twitter'];
}

export function strategySkillSlugs(
  strategy: AgentStrategyDocument,
  fallback: string[],
): string[] {
  return strategy.skillSlugs?.length ? strategy.skillSlugs : fallback;
}

export function resolveOpportunityPlatform(
  strategy: AgentStrategyDocument,
  opportunity: AgentStrategyOpportunityDocument,
): string {
  return opportunity.platformCandidates[0] ?? strategyPlatforms(strategy)[0];
}

export function normalizeOpportunitySourceType(
  sourceType: AgentStrategyOpportunityDocument['sourceType'],
): 'event' | 'evergreen' | 'trend' | undefined {
  return sourceType === 'event' ||
    sourceType === 'evergreen' ||
    sourceType === 'trend'
    ? sourceType
    : undefined;
}

export function computeTopicRelevance(
  strategy: AgentStrategyDocument,
  topic: string,
): number {
  const loweredTopic = topic.toLowerCase();
  const topics = strategy.topics?.map((item) => item.toLowerCase()) ?? [];
  if (topics.length === 0) return 70;
  return topics.some(
    (item) => loweredTopic.includes(item) || item.includes(loweredTopic),
  )
    ? 95
    : 60;
}

export function computePriorityScore(
  strategy: AgentStrategyDocument,
  scores: {
    costEfficiency: number;
    expectedTraffic: number;
    freshness: number;
    historicalConfidence: number;
    relevance: number;
  },
): number {
  const ranking = strategy.rankingPolicy;
  return Number(
    (
      scores.relevance * (ranking?.relevanceWeight ?? 0.3) +
      scores.freshness * (ranking?.freshnessWeight ?? 0.2) +
      scores.expectedTraffic * (ranking?.expectedTrafficWeight ?? 0.2) +
      scores.historicalConfidence *
        (ranking?.historicalConfidenceWeight ?? 0.15) +
      scores.costEfficiency * (ranking?.costEfficiencyWeight ?? 0.15)
    ).toFixed(2),
  );
}

export function estimateOpportunityCost(formats: string[]): number {
  if (formats.includes('image')) return DEFAULT_IMAGE_OPPORTUNITY_COST;
  if (formats.includes('video')) return 40;
  return DEFAULT_TEXT_OPPORTUNITY_COST;
}

export function resolveFormatsForStrategy(
  strategy: AgentStrategyDocument,
): string[] {
  if (String(strategy.agentType).includes('image')) return ['image'];
  if (String(strategy.agentType).includes('video')) return ['video'];
  return (strategy.contentMix?.imagePercent ?? 0) > 50
    ? ['image', 'text']
    : ['text'];
}

export function buildImagePrompt(
  strategy: AgentStrategyDocument,
  opportunity: AgentStrategyOpportunityDocument,
): string {
  return `Create an on-brand social image for ${strategy.label}. Topic: ${opportunity.topic}. Keep it high contrast, clean, scroll-stopping, and aligned to ${strategy.goalProfile}.`;
}

export function shouldAutoPublish(strategy: AgentStrategyDocument): boolean {
  return (
    strategy.autonomyMode === 'auto_publish' &&
    Boolean(strategy.publishPolicy?.autoPublishEnabled)
  );
}

export function resolveReportWindow(reportType: AgentStrategyReportType): {
  periodEnd: Date;
  periodStart: Date;
} {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(
    periodStart.getUTCDate() - (reportType === 'weekly' ? 7 : 1),
  );
  return { periodEnd, periodStart };
}
