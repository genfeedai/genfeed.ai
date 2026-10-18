import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import { AgentStrategyReportType } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import type {
  ImageEvaluationResult,
  OptimizerAnalysisResult,
  PublishGateResult,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import type { PostDocument } from '@api/collections/posts/post.schema';
import type { ReviewTurboRunItemFormat } from '@api/services/turbo-run/constants/review-turbo-run-item-format.constant';
import {
  describePlatformTextLimit,
  getPlatformTextLimit,
  measurePlatformText,
} from '@genfeedai/helpers/content/platform-text-length.helper';

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

export function draftId(draft: PostDocument): string {
  return documentId(draft);
}

export function draftContent(draft: PostDocument): string {
  return draft.description ?? '';
}

export function draftMediaUrls(draft: PostDocument): string[] {
  return Array.isArray(draft.targetAttachments)
    ? draft.targetAttachments.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
}

export function draftTargetSettings(
  draft: PostDocument,
): Record<string, unknown> {
  return draft.targetSettings &&
    typeof draft.targetSettings === 'object' &&
    !Array.isArray(draft.targetSettings)
    ? (draft.targetSettings as Record<string, unknown>)
    : {};
}

export function draftGenerationSettings(
  draft: PostDocument,
): Record<string, unknown> {
  const generation = draftTargetSettings(draft).generation;
  return generation &&
    typeof generation === 'object' &&
    !Array.isArray(generation)
    ? (generation as Record<string, unknown>)
    : {};
}

export function draftMetadata(draft: PostDocument): Record<string, unknown> {
  const generation = draftGenerationSettings(draft);
  return generation.metadata &&
    typeof generation.metadata === 'object' &&
    !Array.isArray(generation.metadata)
    ? (generation.metadata as Record<string, unknown>)
    : {};
}

export function strategyId(strategy: AgentStrategyDocument): string {
  return documentId(strategy);
}

// Scalar FKs only: the legacy `organization`/`brand` aliases are undefined
// unless the query populated the relations, so they never carried a usable id.
export function strategyOrganizationId(
  strategy: AgentStrategyDocument,
): string {
  return strategy.organizationId;
}

export function strategyBrandId(
  strategy: AgentStrategyDocument,
): string | undefined {
  return strategy.brandId ?? undefined;
}

export function strategyPlatforms(strategy: AgentStrategyDocument): string[] {
  return strategy.platforms?.length ? strategy.platforms : ['twitter'];
}

export function strategySkillSlugs(
  strategy: AgentStrategyDocument,
  fallback: string[],
): string[] {
  return strategy.skillSlugs === undefined ? fallback : strategy.skillSlugs;
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

/**
 * Whether a text draft should try the publish gate before review. Auto-publish
 * is earned per platform: a supervised agent that opted in publishes on a
 * platform once it graduated, so the strategy's own mode is not checked here.
 * `AutonomousPublishPolicyService.resolveForTarget` decides each account and
 * sends anything it does not permit to review.
 */
export function shouldAutoPublish(strategy: AgentStrategyDocument): boolean {
  return strategy.publishPolicy?.autoPublishEnabled === true;
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

/**
 * Why a draft is too long for its channel, plus the shorten instruction, or
 * undefined when it fits or the channel has no known limit. Measured with
 * `measurePlatformText`, the same count the account fan-out and the
 * publisher apply.
 */
function findPlatformLengthViolation(
  content: string,
  platform: string | undefined,
): { instruction: string; reason: string } | undefined {
  if (!platform) return undefined;
  const maxLength = getPlatformTextLimit(platform);
  if (maxLength === undefined) return undefined;
  const length = measurePlatformText(content, platform);
  if (length <= maxLength) return undefined;
  return {
    instruction: `Shorten it to ${describePlatformTextLimit(platform, maxLength)}.`,
    reason: `Draft is ${length} characters; the ${platform} limit is ${maxLength}.`,
  };
}

/**
 * A draft that only needs shortening, which goes to review rather than being
 * discarded: the fan-out would refuse it, so it must not reach auto-publish.
 */
export function isOverLengthRevision(gate: PublishGateResult): boolean {
  return gate.decision === 'revise' && gate.isOverPlatformLimit === true;
}

export function scoreTextPublishGate(
  strategy: Pick<AgentStrategyDocument, 'goalProfile' | 'publishPolicy'>,
  content: string,
  analysis: OptimizerAnalysisResult,
  platform?: string,
): PublishGateResult {
  const hasCTA =
    analysis.metadata?.hasCallToAction ??
    /comment|click|learn more|reply|share|visit/i.test(content);
  const overallScore = Number(analysis.overallScore ?? 0);
  const ctaRequired = strategy.goalProfile === 'reach_traffic';
  const minPostScore = strategy.publishPolicy?.minPostScore ?? 70;
  const reasons: string[] = [];
  const lengthViolation = findPlatformLengthViolation(content, platform);

  if (overallScore < minPostScore) {
    reasons.push('Post quality score fell below the publish threshold.');
  }
  if (ctaRequired && !hasCTA) {
    reasons.push('Reach/traffic mode requires a visible call-to-action.');
  }
  if (lengthViolation) {
    reasons.push(lengthViolation.reason);
  }

  return {
    decision:
      reasons.length === 0
        ? 'approved'
        : overallScore >= Math.max(50, minPostScore - 10)
          ? 'revise'
          : 'discard',
    ...(lengthViolation ? { isOverPlatformLimit: true } : {}),
    overallScore,
    reasons:
      reasons.length === 0
        ? [
            'Post cleared the autopilot quality gate.',
            ...(ctaRequired && hasCTA
              ? ['Draft includes a visible call-to-action for traffic intent.']
              : []),
          ]
        : reasons,
    revisionInstructions: [
      ...(lengthViolation ? [lengthViolation.instruction] : []),
      'Strengthen the opening hook.',
      'Improve clarity and readability.',
      'Add a clear call-to-action aligned to traffic intent.',
    ],
    scoreBreakdown: {
      clarity: Number(analysis.breakdown?.clarity ?? 0),
      hook: Number(analysis.breakdown?.engagement ?? 0),
      platformFit: Number(analysis.breakdown?.platformOptimization ?? 0),
      readability: Number(analysis.breakdown?.readability ?? 0),
    },
  };
}

export function scoreImagePublishGate(
  strategy: Pick<AgentStrategyDocument, 'publishPolicy'>,
  evaluation: ImageEvaluationResult,
): PublishGateResult {
  const technicalOverall = Number(
    evaluation?.scores?.technical?.overall ?? evaluation?.overallScore ?? 0,
  );
  const brandOverall = Number(
    evaluation?.scores?.brand?.overall ?? evaluation?.overallScore ?? 0,
  );
  const engagementOverall = Number(
    evaluation?.scores?.engagement?.overall ?? evaluation?.overallScore ?? 0,
  );
  const overallScore = Number(evaluation?.overallScore ?? 0);
  const isApproved =
    overallScore >= (strategy.publishPolicy?.minImageScore ?? 75);

  return {
    decision: isApproved ? 'approved' : 'hold',
    overallScore,
    reasons: isApproved
      ? ['Image cleared the autopilot quality gate.']
      : ['Image quality score did not meet the publish threshold.'],
    revisionInstructions: isApproved
      ? []
      : [
          'Improve composition and scroll-stop strength.',
          'Increase brand fit and reduce visible generation artifacts.',
        ],
    scoreBreakdown: {
      artifactRisk: technicalOverall,
      brandFit: brandOverall,
      composition: technicalOverall,
      lightingContrast: technicalOverall,
      overlayLegibility: technicalOverall,
      scrollStopStrength: engagementOverall,
    },
  };
}

/** Newsletter platforms review as newsletters; every other text as a post. */
export function resolveReviewTurboRunItemFormat(
  platform?: string,
): ReviewTurboRunItemFormat {
  const normalizedPlatform = platform?.toLowerCase();
  return normalizedPlatform === 'beehiiv' ||
    normalizedPlatform === 'substack' ||
    normalizedPlatform === 'email'
    ? 'newsletter'
    : 'post';
}
