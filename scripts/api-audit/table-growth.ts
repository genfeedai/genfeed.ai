/**
 * How fast each Prisma table grows, for ranking `unbounded-read` findings.
 *
 * An unbounded `findMany` is a different risk depending on the table:
 *
 * - `catalog`: global reference rows (models, skills, routing settings). Edited
 *   by operators, never by usage. A full read stays small.
 * - `config`: per-organization or per-brand setup rows (brands, credentials,
 *   members, personas, integrations). They grow with seats, brands and
 *   connections, not with how much a customer generates.
 * - `growing`: append-heavy rows written by usage or by time (generations,
 *   posts, executions, ledgers, analytics, events, messages, trends). An
 *   unbounded read here gets slower every week.
 *
 * The split is a judgement about expected row counts, not a measurement.
 * `bun run audit:api:sql` prints findings grouped by it so `growing` reads are
 * fixed first. A model with an unbounded read that is missing from this table
 * fails the audit's regression test.
 */

export type TableGrowth = 'catalog' | 'config' | 'growing';

const CATALOG_MODELS = [
  'desktopAuthCode',
  'metadata',
  'model',
  'modelProviderContract',
  'providerRoutingSetting',
  'setting',
  'skill',
  'skillAssignment',
  'skillVersion',
  'systemNotificationDestination',
] as const;

const CONFIG_MODELS = [
  'adOptimizationConfig',
  'agentCampaign',
  'agentGoal',
  'agentStrategy',
  'billingAccount',
  'billingAccountMember',
  'billingAccountOrganization',
  'brand',
  'brandMemory',
  'campaignTarget',
  'contentLearningAccount',
  'contentLearningScopeState',
  'contentLearningSharedPolicy',
  'contentPlan',
  'contextBase',
  'contextEntry',
  'creatorSubscription',
  'creditBalance',
  'customerInstance',
  'editorProject',
  'evaluation',
  'externalVoice',
  'forecast',
  'knowledgeSource',
  'knowledgeSpaceMembership',
  'livestreamBotSession',
  'member',
  'monitoredAccount',
  'orgIntegration',
  'organization',
  'organizationSetting',
  'outreachCampaign',
  'persona',
  'personaGrant',
  'profile',
  'referral',
  'referralCode',
  'savedAd',
  'schedule',
  'skillGrant',
  'socialSource',
  'socialWarmupEnrollment',
  'streak',
  'subscription',
  'tag',
  'template',
  'training',
  'user',
  'warmupAccount',
  'workflow',
  'workspaceInboxRead',
  'credential',
] as const;

const GROWING_MODELS = [
  'accountAnalyticsSnapshot',
  'activity',
  'adCreativeMapping',
  'adOptimizationRecommendation',
  'adPerformance',
  'agentMessage',
  'agentStrategyOpportunity',
  'agentThreadEvent',
  'agentThreadSnapshot',
  'agentTransfer',
  'article',
  'asset',
  'brandOsRevision',
  'brandSubscriber',
  'brandedGenerationFeedback',
  'campaignPaidActivation',
  'contentLearningCheckpoint',
  'contentLearningDataset',
  'contentLearningDecision',
  'contentLearningDependency',
  'contentLearningExperimentEvent',
  'contentLearningOperation',
  'contentLearningOpportunity',
  'contentLearningRelease',
  'contentLearningRun',
  'contentPerformance',
  'contentPlanItem',
  'contentPreview',
  'contentVersionPin',
  'creditReservation',
  'creditTransaction',
  'crunGenerationTask',
  'emailSignalCheckpoint',
  'emailSuppression',
  'ingredient',
  'knowledgeSourceConflict',
  'knowledgeSourceVersion',
  'llmVendorCost',
  'mcpApproval',
  'mediaDeliveryVariant',
  'mediaModeration',
  'mediaPerception',
  'mediaTextDecision',
  'mediaVendorCost',
  'newsletterSend',
  'notificationInboxItem',
  'outlierBaselineSnapshot',
  'outlierPostPerformance',
  'post',
  'postAnalytics',
  'postGroup',
  'postPublishFinalization',
  'postingSignature',
  'processedTweet',
  'publishApproval',
  'referralReward',
  'socialConversation',
  'socialMessage',
  'socialReplyCampaignRecipient',
  'systemEventDelivery',
  'task',
  'taskComment',
  'trend',
  'trendingHashtag',
  'trendingSound',
  'trendingVideo',
  'turboProjectItem',
  'turboRunItem',
  'workflowExecution',
  'workflowExecutionNodeResult',
  'workflowNodeContinuation',
] as const;

export const TABLE_GROWTH: Readonly<Record<string, TableGrowth>> =
  Object.fromEntries([
    ...CATALOG_MODELS.map((model) => [model, 'catalog'] as const),
    ...CONFIG_MODELS.map((model) => [model, 'config'] as const),
    ...GROWING_MODELS.map((model) => [model, 'growing'] as const),
  ]);

/**
 * Reads made through a generic `this.delegate` / `this.internalDelegate`
 * carry no model name at the call site. These files bind the delegate to one
 * model, so the growth class is set here by file instead.
 */
export const DELEGATE_FILE_GROWTH: Readonly<Record<string, TableGrowth>> = {
  'apps/server/api/src/collections/agent-strategies/services/agent-strategies.service.ts':
    'config',
  'apps/server/api/src/collections/articles/services/article-analytics.service.ts':
    'growing',
  'apps/server/api/src/collections/brand-memory/services/brand-memory.service.ts':
    'config',
  'apps/server/api/src/collections/brands/services/brands.service.ts': 'config',
  'apps/server/api/src/collections/content-intelligence/services/pattern-store.service.ts':
    'growing',
  'apps/server/api/src/collections/content-performance/services/content-performance.service.ts':
    'growing',
  'apps/server/api/src/collections/credits/services/credit-transactions.service.ts':
    'growing',
  'apps/server/api/src/collections/newsletters/services/newsletters.service.ts':
    'growing',
  'apps/server/api/src/collections/tasks/services/tasks.service.ts': 'growing',
  'apps/server/api/src/shared/factories/service/service.factory.ts': 'growing',
  'apps/server/api/src/shared/services/base/base.service.ts': 'growing',
};

const MODEL_RECEIVER_PATTERN = /(?:^|\.)(?:prisma|tx|transaction)\.(\w+)$/;

export function readModelName(receiver: string): string | undefined {
  return MODEL_RECEIVER_PATTERN.exec(receiver)?.[1];
}

/** `undefined` when the model is missing from the table above. */
export function readTableGrowth(
  receiver: string,
  file: string,
): TableGrowth | undefined {
  const model = readModelName(receiver);
  if (model) {
    return TABLE_GROWTH[model];
  }

  return DELEGATE_FILE_GROWTH[file];
}
