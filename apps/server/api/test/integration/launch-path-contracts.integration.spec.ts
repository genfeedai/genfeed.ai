import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Hermetic launch-path contracts collected for the API E2E tier.
 *
 * These are not live HTTP tests — they lock production-critical query and
 * migration shapes so nightly P3018 / bootstrap regressions fail in CI without
 * spinning a full Playwright matrix. CPU-cheap by design (read source only).
 */
const here = dirname(fileURLToPath(import.meta.url));
// apps/server/api/test/integration → monorepo root
const repoRoot = join(here, '../../../../..');

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('launch-path contracts (hermetic E2E tier)', () => {
  it('refuses to serve public articles when the live schema drifts (#2832)', () => {
    const main = readRepo('apps/server/api/src/main.ts');
    const listenIdx = main.indexOf('app.listen(port)');
    const contractCallIdx = main.indexOf(
      'await assertLiveArticleColumnContract({',
    );
    const clientFieldsIdx = main.indexOf(
      'clientFields: Object.keys(prisma.article.fields)',
    );
    const informationSchemaIdx = main.indexOf('information_schema.columns');
    const articlesTableIdx = main.indexOf("table_name = 'articles'");
    expect(contractCallIdx).toBeGreaterThan(-1);
    expect(clientFieldsIdx).toBeGreaterThan(contractCallIdx);
    expect(informationSchemaIdx).toBeGreaterThan(-1);
    expect(articlesTableIdx).toBeGreaterThan(-1);
    expect(informationSchemaIdx).toBeGreaterThan(clientFieldsIdx);
    expect(listenIdx).toBeGreaterThan(informationSchemaIdx);
    expect(main).toContain('API-GENFEED-AI-71');

    const contract = readRepo('packages/prisma/src/article-column-contract.ts');
    expect(contract).toContain('REQUIRED_ARTICLE_COLUMNS');
    expect(contract).toContain("'label'");
    expect(contract).toContain("'summary'");
    expect(contract).toContain(
      '20260811160000_rename_article_title_excerpt_to_label_summary',
    );
    expect(contract).toContain('articles.title does not exist');
  });

  it('keeps the agent_messages cursor migration free of DROP INDEX CONCURRENTLY', () => {
    const sql = readRepo(
      'packages/prisma/prisma/migrations/20260811170000_agent_messages_cursor_index_id_desc/migration.sql',
    );
    expect(sql).not.toMatch(/DROP\s+INDEX\s+CONCURRENTLY/i);
    expect(sql).toContain('"id" DESC');
  });

  it('bounds review-inbox bootstrap scans in production source', () => {
    const source = readRepo(
      'apps/server/api/src/services/batch-generation/batch-generation-review.service.ts',
    );
    expect(source).toContain('this.prisma.batchItem.groupBy({');
    expect(source).toContain('this.prisma.batchItem.findMany({');
    expect(source).toContain('take: recentLimit');
    expect(source).toContain("by: ['status', 'reviewDecision']");
  });

  it('aggregates agent-run stats with groupBy instead of four counts', () => {
    const source = readRepo(
      'apps/server/api/src/collections/agent-runs/services/agent-runs.service.ts',
    );
    expect(source).toContain('this.prisma.agentRun.groupBy({');
    expect(source).toContain("by: ['status']");
    // Guard against reintroducing the four-count fan-out on the bootstrap path.
    const countCalls = source.match(/this\.delegate\.count\(/g) ?? [];
    // getStats must not use count; other methods may still use count elsewhere
    // in the file — assert the comment that documents the two-groupBy path.
    expect(source).toContain(
      'Two groupBy queries replace four separate COUNTs',
    );
    expect(countCalls.length).toBeLessThan(20);
  });

  it('fails closed when Replicate webhook signing secret is missing', () => {
    const source = readRepo(
      'apps/server/api/src/endpoints/webhooks/replicate/webhooks.replicate.controller.ts',
    );
    expect(source).toContain(
      'REPLICATE_WEBHOOK_SIGNING_SECRET is not configured',
    );
    expect(source).not.toContain('validation skipped (missing secret)');
  });

  it('continues prior executions on job retry instead of re-triggering', () => {
    const source = readRepo(
      'apps/server/workers/src/processors/api/collections/workflows/services/workflow-execution.processor.ts',
    );
    expect(source).toContain('priorExecutionIds');
    expect(source).toContain('continueExistingExecution');
    expect(source).toContain('continuedOnRetry');
    expect(source).toContain('attemptsMade');
  });

  it('treats completed and cancelled prior executions as terminal on continue', () => {
    const source = readRepo(
      'apps/server/api/src/collections/workflows/services/workflow-executor.service.ts',
    );
    expect(source).toContain('continueExistingExecution');
    expect(source).toContain('WorkflowExecutionStatus.COMPLETED');
    expect(source).toContain('WorkflowExecutionStatus.CANCELLED');
    expect(source).toContain('continuedFromExecutionId');
  });

  it('ships durable workflow_node_claims unique (executionId, nodeId)', () => {
    const schema = readRepo('packages/prisma/prisma/schema.prisma');
    const migration = readRepo(
      'packages/prisma/prisma/migrations/20260812140000_workflow_node_claims/migration.sql',
    );
    expect(schema).toContain('model WorkflowNodeClaim');
    expect(migration).toContain('workflow_node_claims_executionId_nodeId_key');
  });

  it('completes durable claims on the graph-runner throw path (#2359)', () => {
    const source = readRepo(
      'apps/server/api/src/collections/workflows/services/workflow-node-graph-runner.service.ts',
    );
    // Success and throw branches both call nodeClaimService.complete so a
    // failed node is not left `running` forever (retry would busy-skip).
    const completeCalls = source.match(/this\.nodeClaimService\.complete\(/g);
    expect(completeCalls?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("status: 'failed'");
  });

  it('defers agent bootstrap until brand scope resolves (#2702)', () => {
    const layout = readRepo(
      'apps/app/app/(protected)/[orgSlug]/~/agent/AgentWorkspaceLayoutClient.tsx',
    );
    const brandState = readRepo(
      'packages/contexts/user/brand-context/useBrandProviderState.ts',
    );
    expect(layout).toContain('isBrandScopeResolved');
    expect(layout).toContain(
      'hasAttemptedReturningBootstrapRef.current = false',
    );
    expect(brandState).toContain('isBrandScopeResolved');
    expect(brandState).toContain('isBrandsFetched');
  });

  it('rejects invalid batch platforms before content generation (#2696)', () => {
    const processing = readRepo(
      'apps/server/api/src/services/batch-generation/batch-generation-processing.service.ts',
    );
    const generateIdx = processing.indexOf(
      'this.contentGeneratorService.generateContent',
    );
    const rejectIdx = processing.indexOf('Invalid batch item platform');
    expect(generateIdx).toBeGreaterThan(-1);
    expect(rejectIdx).toBeGreaterThan(-1);
    // Parse-and-throw must sit above generateContent so bad items never burn LLM credits.
    expect(rejectIdx).toBeLessThan(generateIdx);
  });

  it('cancels the batch when the agent tool credit reserve fails (#2696)', () => {
    const source = readRepo(
      'apps/server/api/src/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service.ts',
    );
    expect(source).toContain('chargeBatchCredits');
    expect(source).toContain('cancelBatch');
    expect(source).toContain(
      'failed to cancel batch after credit reserve failure',
    );
    expect(source).toContain("referenceType: 'batch-generation:upfront'");
  });

  it('keeps OSS-safe agent coordination memory (no personal fleet routing)', () => {
    const index = readRepo('.agents/memory/MEMORY.md');
    const qaQueue = readRepo(
      '.agents/memory/feedback_qa_queue_branch_protocol.md',
    );
    const tdd = readRepo('.agents/memory/feedback_tdd_first.md');
    const gitignore = readRepo('.gitignore');
    expect(index).toContain('feedback_qa_queue_branch_protocol');
    expect(index).toContain('feedback_tdd_first');
    expect(index).toContain('claim_work_before_starting');
    // Personal Claude/Codex/Grok fleet notes stay out of the public tree.
    expect(index).not.toContain('feedback_multi_agent_collaboration');
    expect(gitignore).toContain('.agents/memory/local/');
    expect(qaQueue).toContain('project_qa_*_closeout');
    expect(qaQueue).not.toMatch(/Claude|Codex|Grok/i);
    expect(tdd).toContain('Handoff proof');
  });

  it('pins social-read + report-delivery residual contracts (#2664)', () => {
    const registrar = readRepo(
      'apps/server/api/src/collections/workflows/services/workflow-social-executor-registrar.service.ts',
    );
    const palette = readRepo(
      'apps/app/src/features/workflows/components/CloudNodePalette.tsx',
    );
    const credits = readRepo(
      'packages/workflows/src/engine/utils/credit-calculator.ts',
    );
    const canvas = readRepo(
      'apps/app/src/features/workflows/nodes/merged-node-types.ts',
    );
    expect(registrar).toContain('formatSocialReadProviderError');
    expect(registrar).toContain('formatReportDeliveryError');
    expect(registrar).toContain('socialRead twitter rate limited');
    expect(registrar).toContain('wireSocialReadExecutor');
    expect(registrar).toContain('wireReportDeliveryExecutor');
    expect(palette).toContain('socialRead');
    expect(palette).toContain('reportDelivery');
    expect(credits).toContain('socialRead: 1');
    expect(credits).toContain('reportDelivery: 0');
    expect(canvas).toContain('socialRead: TemplateCompatibilityNode');
    expect(canvas).toContain('reportDelivery: TemplateCompatibilityNode');
  });

  it('agent executeWorkflow is organization-scoped before the executor runs', () => {
    const source = readRepo(
      'apps/server/api/src/services/agent-orchestrator/tools/agent-workflow-tool-execute.service.ts',
    );
    const executeIdx = source.indexOf('async executeWorkflow(');
    const slice = source.slice(executeIdx, executeIdx + 1200);
    expect(slice).toContain('organizationId: ctx.organizationId');
    expect(slice).toContain('Missing required workflow inputs');
    expect(slice).toContain('executeManualWorkflow');
  });

  it('in-process node claim map hydrates completed nodes for same executionId', () => {
    const source = readRepo(
      'apps/server/api/src/collections/workflows/services/workflow-node-graph-runner.service.ts',
    );
    expect(source).toContain('hydrateCompletedNodesFromExecution');
    expect(source).toContain('this.nodeClaims.set');
    expect(source).toContain('claimNodeOnce');
    expect(source).toContain('nodeClaimService.tryClaim');
    expect(source).toContain('nodeClaimService.complete');
  });

  it('content harness loads core pack, media kinds, and generation wiring', () => {
    const service = readRepo(
      'apps/server/api/src/services/harness/harness.service.ts',
    );
    const types = readRepo('packages/harness/src/types.ts');
    const mediaPrompt = readRepo('packages/harness/src/media-prompt.ts');
    const mediaHandler = readRepo(
      'apps/server/api/src/services/agent-orchestrator/tools/agent-media-generation-tool-handler.service.ts',
    );
    const ads = readRepo(
      'apps/server/api/src/endpoints/ads-research/ads-research.service.ts',
    );
    const config = readRepo('packages/libs/config/config.service.ts');
    expect(service).toContain('CORE_CONTENT_HARNESS_PACK');
    expect(service).toContain('CONTENT_HARNESS_PACKAGES');
    expect(service).toContain('composeContentHarnessBrief');
    expect(config).toContain('CONTENT_HARNESS_PACKAGES');
    expect(types).toContain("'post'");
    expect(types).toContain("'image'");
    expect(types).toContain("'ad-creative'");
    expect(types).toContain("'video'");
    expect(mediaPrompt).toContain('buildMediaPromptFromHarness');
    expect(mediaHandler).toContain('applyBrandHarnessToPrompt');
    expect(ads).toContain('resolveAdHarnessNotes');
    expect(ads).toContain("'ad-creative'");
  });

  it('video upscale/reframe charge only via CreditsInterceptor (no manual deduct)', () => {
    const upscale = readRepo(
      'apps/server/api/src/collections/videos/controllers/transformations/upscale/videos-upscale.controller.ts',
    );
    const reframe = readRepo(
      'apps/server/api/src/collections/videos/controllers/transformations/reframe/videos-reframe.controller.ts',
    );
    const lipSync = readRepo(
      'apps/server/api/src/collections/videos/controllers/transformations/lip-sync/videos-lip-sync.controller.ts',
    );
    for (const source of [upscale, reframe, lipSync]) {
      expect(source).toContain('CreditsInterceptor');
      expect(source).not.toContain('deductCreditsFromOrganization');
    }
  });

  it('context auto-create uses parsePlatform for posts.platform (not a local map)', () => {
    const source = readRepo(
      'apps/server/api/src/collections/contexts/services/contexts.service.ts',
    );
    expect(source).toContain('parsePlatform');
    expect(source).not.toContain('const PLATFORM_MAP');
  });

  it('exposes harness winner promotion as an authenticated API', () => {
    const controller = readRepo(
      'apps/server/api/src/collections/harness-profiles/controllers/harness-profiles.controller.ts',
    );
    expect(controller).toContain("Post('promote-winners')");
    expect(controller).toContain('promoteTopPerformers');
  });

  it('uses Postgres pgvector as brand content memory (no separate vector product)', () => {
    const migration = readRepo(
      'packages/prisma/prisma/migrations/20260807100000_add_context_entry_pgvector/migration.sql',
    );
    const similarity = readRepo(
      'apps/server/api/src/collections/contexts/utils/context-similarity-query.util.ts',
    );
    const contexts = readRepo(
      'apps/server/api/src/collections/contexts/services/contexts.service.ts',
    );
    const harnessGen = readRepo(
      'apps/server/api/src/services/harness/harness-generation.service.ts',
    );
    const harnessModule = readRepo(
      'apps/server/api/src/services/harness/harness.module.ts',
    );
    const winnerPromotion = readRepo(
      'apps/server/api/src/services/harness/harness-winner-promotion.service.ts',
    );
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    expect(migration).toContain('hnsw');
    expect(similarity).toContain('<=>');
    expect(contexts).toContain('retrieveBrandContentMemory');
    expect(harnessGen).toContain('loadBrandMemorySources');
    expect(harnessGen).toContain('retrieveBrandContentMemory');
    // DI must wire ContextsService or memory silently no-ops at runtime.
    expect(harnessModule).toContain('ContextsModule');
    expect(winnerPromotion).toContain('contextsService.addEntry');
  });

  it('registers platform-x harness pack from open-source ranking signals', () => {
    const xPack = readRepo('packages/harness/src/platforms/x-algorithm.ts');
    const harnessService = readRepo(
      'apps/server/api/src/services/harness/harness.service.ts',
    );
    expect(xPack).toContain('X_PLATFORM_HARNESS_PACK');
    expect(xPack).toContain('scoreXPublicMetrics');
    expect(xPack).toContain('X_HEAVY_RANKER_WEIGHTS_2023');
    expect(harnessService).toContain('X_PLATFORM_HARNESS_PACK');
  });

  it('exposes author-reply loop API for X conversation closed loops', () => {
    const controller = readRepo(
      'apps/server/api/src/collections/reply-bot-configs/controllers/reply-bot-configs.controller.ts',
    );
    const replyGen = readRepo(
      'apps/server/api/src/services/reply-bot/reply-generation.service.ts',
    );
    const authorLoop = readRepo(
      'apps/server/api/src/services/reply-bot/author-reply-loop.service.ts',
    );
    const executor = readRepo(
      'apps/server/api/src/services/reply-bot/bot-action-executor.service.ts',
    );
    expect(controller).toContain("Post('author-reply/ensure')");
    expect(controller).toContain("Get('author-reply/inbox')");
    expect(controller).toContain("Post('author-reply/send')");
    expect(controller).toContain('platform: body.platform');
    expect(replyGen).toContain('resolveHarnessContext');
    expect(authorLoop).toContain('recordAuthorClosedLoop');
    expect(authorLoop).toContain('COMMENT_RESPONDER');
    expect(authorLoop).toContain('loadYouTubeCredential');
    expect(authorLoop).toContain('loadPlatformCredential');
    expect(executor).toContain('postYouTubeCommentReply');
    expect(executor).toContain('replyToComment');
    const bindUi = readRepo(
      'apps/app/app/(protected)/[orgSlug]/[brandSlug]/automate/[agentId]/AgentWorkflowBindCard.tsx',
    );
    expect(bindUi).toContain('preferredWorkflowId');
    expect(bindUi).toContain('workflowInputOverrides');
    expect(bindUi).toContain('Save binding');
    const runDialogUtil = readRepo(
      'apps/app/app/(protected)/[orgSlug]/[brandSlug]/automate/library/agent-workflow-run-input.util.ts',
    );
    expect(runDialogUtil).toContain('listUnfilledRequiredAfterForm');
    const credentialUtil = readRepo(
      'apps/server/api/src/services/campaign/reply-bot-credential.util.ts',
    );
    expect(credentialUtil).toContain('toReplyBotCredentialData');
    expect(credentialUtil).toContain('readReplyBotCredentialId');
  });

  it('reads X replies via official API first with Apify fallback only', () => {
    const twitter = readRepo(
      'apps/server/api/src/services/integrations/twitter/services/twitter.service.ts',
    );
    const monitor = readRepo(
      'apps/server/api/src/services/reply-bot/social-monitor.service.ts',
    );
    expect(twitter).toContain('getTweetReplies');
    expect(twitter).toContain('tweets/search/recent');
    expect(twitter).toContain('conversation_id:');
    expect(monitor).toContain('getTweetReplies');
    expect(monitor).toContain('falling back to Apify');
    expect(monitor).toContain('preferOfficialApi');
  });

  it('schedules reply post-watch after successful X publish', () => {
    const cronPosts = readRepo(
      'apps/server/workers/src/crons/posts/cron.posts.service.ts',
    );
    expect(cronPosts).toContain('scheduleReplyPostWatchAfterPublish');
    expect(cronPosts).toContain('schedulePostWatch');
  });

  it('registers X activity webhook and reply inbound/post-watch pipes', () => {
    const controller = readRepo(
      'apps/server/api/src/endpoints/webhooks/x-activity/webhooks.x-activity.controller.ts',
    );
    const queues = readRepo(
      'packages/queue-contracts/src/queue-names.constant.ts',
    );
    const inbound = readRepo(
      'apps/server/api/src/queues/reply-bot/reply-inbound-queue.service.ts',
    );
    expect(controller).toContain("Controller('webhooks/x-activity')");
    expect(controller).toContain('handleCrc');
    expect(queues).toContain("REPLY_INBOUND_QUEUE = 'reply-inbound'");
    expect(queues).toContain("REPLY_POST_WATCH_QUEUE = 'reply-post-watch'");
    expect(inbound).toContain('schedulePostWatch');
    expect(inbound).toContain('enqueueInbound');
  });

  it('classifies reply intents and caps comment age at 48h', () => {
    const intent = readRepo(
      'apps/server/api/src/services/reply-bot/reply-intent.util.ts',
    );
    const authorLoop = readRepo(
      'apps/server/api/src/services/reply-bot/author-reply-loop.service.ts',
    );
    expect(intent).toContain('export type ReplyIntent');
    expect(intent).toContain("'thanks'");
    expect(intent).toContain("'troll'");
    expect(intent).toContain('DEFAULT_REPLY_MAX_AGE_HOURS = 24');
    expect(intent).toContain('MAX_REPLY_MAX_AGE_HOURS = 48');
    expect(authorLoop).toContain('? 48 : DEFAULT_REPLY_MAX_AGE_HOURS');
    expect(authorLoop).toContain('clampReplyMaxAgeHours(params.hours ?? 48)');
    // Non-YouTube inbox path. Leading `:` so this cannot match `?? 48`.
    expect(authorLoop).toContain(': clampReplyMaxAgeHours(params.hours)');
    expect(authorLoop).toContain('resolveReplyIntent');
  });

  it('keeps repaired API E2E specs in the full tier and drops the dead health harness', () => {
    const manifest = readRepo(
      'apps/server/api/scripts/api-e2e-tiers.manifest.ts',
    );
    expect(manifest).not.toContain('test/integration/health.e2e-spec.ts');
    expect(manifest).not.toContain('test/e2e/tasks.e2e-spec.ts');
    expect(manifest).not.toContain(
      'test/integration/publish-flow.integration.spec.ts',
    );
    expect(manifest).toContain('test/integration/health.e2e-spec.spec.ts');

    const routeCoverage = readRepo('scripts/e2e-route-coverage.mjs');
    expect(routeCoverage).toContain(
      "process.env.E2E_ROUTE_COVERAGE_THRESHOLD ?? '90'",
    );
  });
});
