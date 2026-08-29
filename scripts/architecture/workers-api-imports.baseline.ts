/**
 * Ratchet baseline for check-no-api-imports-in-workers.ts (#1090 / #1347).
 *
 * Temporary release fallback: v0.1.69 restores the last production-proven
 * Nest module composition while the extracted WorkersDomainModule provider
 * graph is repaired after release. Keep this exact list shrinking again.
 *
 * #3924 (workflow-execution hard cut) swaps three entries for three: the
 * workers now compose `ai-influencer`, `lifecycle-emails`, and `webhooks` so
 * their `OnModuleInit` system-workflow action registrations exist in the worker
 * process, and drops the outreach-campaigns-core, managed-inference, and
 * knowledge-source-ingest module imports the cut deleted. `WebhooksModule` also
 * drags its eleven controllers into the worker process — collapsing it to a
 * server-tier provider graph belongs with the WorkersDomainModule repair.
 */

export const WORKERS_API_IMPORT_BASELINE: readonly string[] = [
  '@api/collections/activities/activities.module',
  '@api/collections/agent-campaigns/agent-campaigns.module',
  '@api/collections/agent-strategies/agent-strategies.module',
  '@api/collections/articles/articles.module',
  '@api/collections/clip-projects/clip-projects-core.module',
  '@api/collections/content-performance/content-performance.module',
  '@api/collections/contexts/contexts.module',
  '@api/collections/creative-patterns/creative-patterns.module',
  '@api/collections/credentials/credentials.module',
  '@api/collections/credits/credits.module',
  '@api/collections/ingredients/ingredients.module',
  '@api/collections/insights/insights.module',
  '@api/collections/metadata/metadata.module',
  '@api/collections/models/models.module',
  '@api/collections/organization-settings/organization-settings.module',
  '@api/collections/organizations/organizations.module',
  '@api/collections/outreach-campaigns/outreach-campaigns.module',
  '@api/collections/post-groups/post-groups.module',
  '@api/collections/posts/posts.module',
  '@api/collections/reply-bot-configs/reply-bot-configs.module',
  '@api/collections/rss-sources/rss-sources.module',
  '@api/collections/social-inbox/social-inbox.module',
  '@api/collections/streaks/streaks.module',
  '@api/collections/trends/trends.module',
  '@api/collections/voices/voices.module',
  '@api/collections/workflow-executions/workflow-executions.module',
  '@api/collections/workflows/workflows.module',
  '@api/endpoints/webhooks/webhooks.module',
  '@api/queues/heygen-poll/heygen-poll.module',
  '@api/services/agent-campaign/agent-campaign-orchestrator.module',
  '@api/services/agent-orchestrator/agent-orchestrator.module',
  '@api/services/agent-orchestrator/agent-stream-publisher.module',
  '@api/services/ai-influencer/ai-influencer.module',
  '@api/services/batch-content/batch-content.module',
  '@api/services/batch-generation/batch-generation.module',
  '@api/services/byok-billing/byok-billing.module',
  '@api/services/byok/byok.module',
  '@api/services/cache/cache.module',
  '@api/services/campaign/campaign.module',
  '@api/services/content-optimization/content-optimization.module',
  '@api/services/content-orchestration/content-orchestration.module',
  '@api/services/distribution/telegram/telegram-distribution.module',
  '@api/services/lifecycle-emails/lifecycle-emails.module',
  '@api/services/integrations/publishers/publishers.module',
  '@api/services/notifications/notifications.module',
  '@api/services/public-clip-tool/public-clip-tool-store.module',
  '@api/services/quota/quota.module',
  '@api/services/reply-bot/reply-bot.module',
  '@api/services/signup-prefill/signup-prefill.module',
  '@api/services/skill-executor/skill-executor.module',
  '@api/services/task-orchestration/task-orchestration.module',
  '@api/services/webhook-client/webhook-client.module',
  '@api/services/whisper/whisper.module',
  '@api/shared/shared.module',
];
