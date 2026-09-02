import { describe, expect, it } from 'vitest';

import { readRepo, readSourceOf } from './launch-path-source.util';

/**
 * Hermetic launch-path contracts collected for the API E2E tier.
 *
 * These are not live HTTP tests — they lock production-critical query and
 * migration shapes so nightly P3018 / bootstrap regressions fail in CI without
 * spinning a full Playwright matrix. CPU-cheap by design (read source only).
 *
 * Subjects are located by their exported declaration inside an owning subtree
 * (`readSourceOf`), never by a hardcoded path: #3508 relocated
 * `scheduleReplyPostWatchAfterPublish` and reddened the release Full Suite
 * while the production code was correct. `readRepo` is reserved for artifacts
 * whose PATH IS the contract — migrations, the Prisma schema, `.gitignore`,
 * agent memory, tier manifests.
 */
// Declarations may live in api or server after the shared-server extraction.
const API_SRC = 'apps/server';
const APP = 'apps/app';
const SERVER_SRC = 'apps/server/api/src';
const WORKERS_SRC = 'apps/server/workers/src';

describe('launch-path contracts (hermetic E2E tier)', () => {
  it('refuses to serve public articles when the live schema drifts (#2832)', () => {
    // main.ts is the bootstrap entry point — its path is part of the contract.
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

    const contract = readSourceOf('REQUIRED_ARTICLE_COLUMNS', {
      root: 'packages/prisma/src',
    });
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
    const source = readSourceOf('BatchGenerationReviewService', {
      root: API_SRC,
    });
    expect(source).toContain('this.prisma.batchItem.groupBy({');
    expect(source).toContain('this.prisma.batchItem.findMany({');
    expect(source).toContain('take: recentLimit');
    expect(source).toContain("by: ['status', 'reviewDecision']");
  });

  it('fails closed when Replicate webhook signing secret is missing', () => {
    const source = readSourceOf('ReplicateWebhookController', {
      root: API_SRC,
    });
    expect(source).toContain(
      'REPLICATE_WEBHOOK_SIGNING_SECRET is not configured',
    );
    expect(source).not.toContain('validation skipped (missing secret)');
  });

  it('continues prior executions on job retry instead of re-triggering', () => {
    const source = readSourceOf('WorkflowExecutionProcessor', {
      root: WORKERS_SRC,
    });
    expect(source).toContain('priorExecutionIds');
    expect(source).toContain('continueExistingExecution');
    expect(source).toContain('continuedOnRetry');
    expect(source).toContain('attemptsMade');
  });

  it('executes content pipelines as persisted action graphs without a parallel queue engine', () => {
    const service = readSourceOf('ContentOrchestrationService', {
      root: API_SRC,
    });
    const queueNames = readRepo(
      'packages/contracts/src/queue/queue-names.constant.ts',
    );
    const processors = readSourceOf('ProcessorsModule', {
      root: WORKERS_SRC,
    });

    expect(service).toContain('buildContentPipelineWorkflowDefinition');
    expect(service).toContain(
      'systemWorkflowRunner.runDefinition<PipelineResultV2>',
    );
    expect(service).toContain("'content.pipeline.generate-image'");
    expect(service).toContain("'content.pipeline.publish'");
    expect(service).toContain("'content.pipeline.resolve-context'");
    expect(service).not.toContain('for (let i = 0; i < config.steps.length');
    expect(queueNames).not.toContain('CONTENT_PIPELINE_QUEUE');
    expect(processors).not.toContain('ContentPipelineProcessor');
  });

  it('executes clip generation and hook review through persisted workflow nodes', () => {
    const generation = readSourceOf('ClipGenerationService', {
      root: API_SRC,
    });
    const approval = readSourceOf('HookClipApprovalService', {
      root: API_SRC,
    });
    const clipModule = readSourceOf('ClipProjectsModule', { root: API_SRC });

    expect(generation).toContain('buildClipGenerationWorkflowDefinition');
    expect(generation).toContain('startWorkflow');
    expect(generation).toContain("'clip.generation.generate-one'");
    expect(generation).not.toContain('ClipOrchestratorService');
    expect(approval).toContain('submitReviewGateApproval');
    expect(approval).not.toContain('claimConfirmation');
    expect(clipModule).not.toContain('ClipOrchestratorModule');
  });

  it('executes clip continuity as queued action nodes without Redis polling', () => {
    const continuity = readSourceOf('ClipContinuityWorkflowService', {
      root: API_SRC,
    });
    const definition = readSourceOf('buildClipContinuityWorkflowDefinition', {
      root: API_SRC,
    });
    const workflowQueue = readSourceOf('WorkflowExecutionQueueService', {
      root: API_SRC,
    });

    expect(continuity).toContain('queueSystemWorkflow');
    expect(continuity).toContain('CLIP_CONTINUITY_ACTION_IDS.PERSIST_REPORT');
    expect(continuity).not.toContain('@Interval');
    expect(continuity).not.toContain('ClipOrchestratorStateStore');
    expect(definition).toContain("actionId: 'videoQa'");
    expect(workflowQueue).toContain("'system-run'");
  });

  it('treats completed and cancelled prior executions as terminal on continue', () => {
    const source = readSourceOf('WorkflowExecutorService', { root: API_SRC });
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
    const source = readSourceOf('WorkflowNodeGraphRunnerService', {
      root: API_SRC,
    });
    // Success and throw branches both call nodeClaimService.complete so a
    // failed node is not left `running` forever (retry would busy-skip).
    const completeCalls = source.match(/this\.nodeClaimService\.complete\(/g);
    expect(completeCalls?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("status: 'failed'");
  });

  it('defers agent bootstrap until brand scope resolves (#2702)', () => {
    const layout = readSourceOf('AgentWorkspaceLayoutClient', { root: APP });
    const brandState = readSourceOf('useBrandProviderState', {
      root: 'packages/contexts',
    });
    expect(layout).toContain('isBrandScopeResolved');
    expect(layout).toContain(
      'hasAttemptedReturningBootstrapRef.current = false',
    );
    expect(brandState).toContain('isBrandScopeResolved');
    expect(brandState).toContain('isBrandsFetched');
  });

  it('rejects invalid batch platforms before content generation (#2696)', () => {
    const processing = readSourceOf('BatchGenerationProcessingService', {
      root: API_SRC,
    });
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
    const source = readSourceOf('AgentMediaBatchGenerationService', {
      root: API_SRC,
    });
    expect(source).toContain('reserveCreditsOrCancel');
    expect(source).toContain('cancelBatch');
    expect(source).toContain(
      'failed to cancel batch after credit reserve failure',
    );
    expect(source).toContain('this.creditsUtilsService.reserveCredits');
    expect(source).toContain(
      'idempotencyKey: `batch-generation:${params.batchId}`',
    );
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
    const registrar = readSourceOf('WorkflowSocialExecutorRegistrarService', {
      root: API_SRC,
    });
    const palette = readSourceOf('CloudNodePalette', { root: APP });
    const credits = readSourceOf('DEFAULT_CREDIT_COSTS', {
      root: 'packages/workflows/src',
    });
    const canvas = readSourceOf('cloudNodeTypes', { root: APP });
    expect(registrar).toContain('formatSocialReadProviderError');
    expect(registrar).toContain('formatReportDeliveryError');
    expect(registrar).toContain('socialRead twitter rate limited');
    expect(registrar).toContain('wireSocialReadExecutor');
    expect(registrar).toContain('wireReportDeliveryExecutor');
    expect(palette).toContain('ALL_ACTIONS');
    expect(palette).toContain("action.visibility === 'workflow'");
    expect(palette).toContain("type: 'genfeedAction'");
    expect(credits).toContain('ALL_ACTIONS');
    expect(credits).toContain('action.credits.amount');
    expect(canvas).toContain('genfeedAction: coreNodeTypes.genfeedAction');
    expect(canvas).not.toContain('socialRead:');
    expect(canvas).not.toContain('reportDelivery:');
  });

  it('agent executeWorkflow is organization-scoped before the executor runs', () => {
    const source = readSourceOf('AgentWorkflowToolExecuteService', {
      root: API_SRC,
    });
    const executeIdx = source.indexOf('async executeWorkflow(');
    expect(executeIdx).toBeGreaterThan(-1);
    // Assert by ordering rather than a fixed window: new branches at the top of
    // executeWorkflow must not be able to push the org scope past the executor.
    const scopeIdx = source.indexOf(
      'organizationId: ctx.organizationId',
      executeIdx,
    );
    const inputsIdx = source.indexOf(
      'Missing required workflow inputs',
      executeIdx,
    );
    const executorIdx = source.indexOf('executeManualWorkflow', executeIdx);
    expect(scopeIdx).toBeGreaterThan(executeIdx);
    expect(inputsIdx).toBeGreaterThan(scopeIdx);
    expect(executorIdx).toBeGreaterThan(scopeIdx);
  });

  it('in-process node claim map hydrates completed nodes for same executionId', () => {
    const source = readSourceOf('WorkflowNodeGraphRunnerService', {
      root: API_SRC,
    });
    expect(source).toContain('hydrateCompletedNodesFromExecution');
    expect(source).toContain('completeNodeClaim(this.nodeClaims');
    expect(source).toContain('claimNodeOnce(this.nodeClaims');
    expect(source).toContain('nodeClaimService.tryClaim');
    expect(source).toContain('nodeClaimService.complete');
  });

  it('content harness loads core pack, media kinds, and generation wiring', () => {
    const service = readSourceOf('ContentHarnessService', { root: API_SRC });
    const types = readSourceOf('ContentKind', { root: 'packages/harness/src' });
    const mediaPrompt = readSourceOf('buildMediaPromptFromHarness', {
      root: 'packages/harness/src',
    });
    const mediaHandler = readSourceOf('AgentMediaAssetGenerationService', {
      root: API_SRC,
    });
    const ads = readSourceOf('AdsResearchService', { root: API_SRC });
    const config = readSourceOf('ConfigService', {
      root: 'packages/libs/config',
    });
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
    const controllers = [
      'VideosUpscaleController',
      'VideosReframeController',
      'VideosLipSyncController',
    ];
    for (const controller of controllers) {
      const source = readSourceOf(controller, { root: API_SRC });
      expect(source).toContain('CreditsInterceptor');
      expect(source).not.toContain('deductCreditsFromOrganization');
    }
  });

  it('context auto-create uses parsePlatform for posts.platform (not a local map)', () => {
    const source = readSourceOf('ContextsService', { root: API_SRC });
    expect(source).toContain('parsePlatform');
    expect(source).not.toContain('const PLATFORM_MAP');
  });

  it('exposes harness winner promotion as an authenticated API', () => {
    const controller = readSourceOf('HarnessProfilesController', {
      root: API_SRC,
    });
    expect(controller).toContain("Post('promote-winners')");
    expect(controller).toContain(
      'AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS_BRAND',
    );
    expect(controller).toContain('runWorkflow');
  });

  it('uses Postgres pgvector as brand content memory (no separate vector product)', () => {
    const migration = readRepo(
      'packages/prisma/prisma/migrations/20260807100000_add_context_entry_pgvector/migration.sql',
    );
    const similarity = readSourceOf('buildContextSimilarityQuery', {
      root: API_SRC,
    });
    const contexts = readSourceOf('ContextsService', { root: API_SRC });
    const harnessGen = readSourceOf('HarnessGenerationService', {
      root: API_SRC,
    });
    const harnessModule = readSourceOf('ContentHarnessModule', {
      root: API_SRC,
    });
    const winnerPromotion = readSourceOf('HarnessWinnerPromotionService', {
      root: API_SRC,
    });
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

  it('ingests KnowledgeBase sources as chunked ContextEntry embeddings', () => {
    const autoCreate = readSourceOf('ContextsService', { root: API_SRC });
    const ingest = readSourceOf('KnowledgeSourceIngestService', {
      root: API_SRC,
    });
    const extract = readSourceOf('UnsupportedKnowledgeSourceError', {
      root: API_SRC,
    });
    const workflow = readSourceOf('KnowledgeSourceIngestWorkflowService', {
      root: SERVER_SRC,
    });
    expect(autoCreate).toContain('chunkText');
    expect(autoCreate).toContain('this.addEntry');
    expect(ingest).toContain('extractSourceText');
    expect(ingest).toContain('chunkText');
    expect(ingest).toContain('scanForBackfill');
    expect(extract).toContain('safeFetch');
    expect(extract).toContain('UnsupportedKnowledgeSourceError');
    expect(workflow).toContain('KNOWLEDGE_SOURCE_ACTION_IDS.LOAD');
    expect(workflow).toContain('KNOWLEDGE_SOURCE_ACTION_IDS.FINALIZE');
    expect(workflow).toContain('queueSystemWorkflow');
  });

  it('registers platform-x harness pack from open-source ranking signals', () => {
    const xPack = readSourceOf('X_HEAVY_RANKER_WEIGHTS_2023', {
      root: 'packages/harness/src',
    });
    const harnessService = readSourceOf('ContentHarnessService', {
      root: API_SRC,
    });
    expect(xPack).toContain('X_PLATFORM_HARNESS_PACK');
    expect(xPack).toContain('scoreXPublicMetrics');
    expect(harnessService).toContain('X_PLATFORM_HARNESS_PACK');
  });

  it('exposes author-reply loop API for X conversation closed loops', () => {
    const controller = readSourceOf('ReplyBotConfigsController', {
      root: API_SRC,
    });
    const replyGen = readSourceOf('ReplyGenerationService', { root: API_SRC });
    const authorLoop = readSourceOf('AuthorReplyLoopService', {
      root: API_SRC,
    });
    const executor = readSourceOf('BotActionExecutorService', {
      root: API_SRC,
    });
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
    const bindUi = readSourceOf('AgentWorkflowBindCard', { root: APP });
    expect(bindUi).toContain('preferredWorkflowId');
    expect(bindUi).toContain('workflowInputOverrides');
    expect(bindUi).toContain('Save binding');
    const runDialogUtil = readSourceOf('buildAgentWorkflowRunInput', {
      root: APP,
    });
    expect(runDialogUtil).toContain('listUnfilledRequiredAfterForm');
    const credentialUtil = readSourceOf('toReplyBotCredentialData', {
      root: API_SRC,
    });
    expect(credentialUtil).toContain('readReplyBotCredentialId');
  });

  it('reads X replies via official API first with Apify fallback only', () => {
    const twitter = readSourceOf('TwitterService', { root: SERVER_SRC });
    const monitor = readSourceOf('SocialMonitorService', { root: API_SRC });
    expect(twitter).toContain('getTweetReplies');
    expect(twitter).toContain('tweets/search/recent');
    expect(twitter).toContain('conversation_id:');
    expect(monitor).toContain('getTweetReplies');
    expect(monitor).toContain('falling back to Apify');
    expect(monitor).toContain('preferOfficialApi');
  });

  it('schedules reply post-watch after successful X publish', () => {
    const delivery = readSourceOf('ScheduledPostDeliveryService', {
      root: WORKERS_SRC,
    });
    expect(delivery).toContain('scheduleReplyPostWatchAfterPublish');
    expect(delivery).toContain('schedulePostWatch');
  });

  it('registers X activity webhook and reply inbound/post-watch workflows', () => {
    const controller = readSourceOf('XActivityWebhookController', {
      root: API_SRC,
    });
    const definitions = readSourceOf('REPLY_INGESTION_WORKFLOW_IDS', {
      root: API_SRC,
    });
    const inbound = readSourceOf('ReplyInboundProcessorService', {
      root: API_SRC,
    });
    const postWatch = readSourceOf('ReplyPostWatchService', { root: API_SRC });
    expect(controller).toContain("Controller('webhooks/x-activity')");
    expect(controller).toContain('handleCrc');
    expect(definitions).toContain("INBOUND: 'reply.inbound.process'");
    expect(definitions).toContain("POST_WATCH: 'reply.post-watch.process'");
    expect(inbound).toContain('queueSystemWorkflow');
    expect(postWatch).toContain('schedulePostWatch');
    expect(postWatch).toContain('queueSystemWorkflow');
  });

  it('classifies reply intents and caps comment age at 48h', () => {
    const intent = readSourceOf('ReplyIntent', { root: API_SRC });
    const authorLoop = readSourceOf('AuthorReplyLoopService', {
      root: API_SRC,
    });
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
    // The manifest and the coverage script are addressed by path on purpose:
    // the tier runner resolves them from these exact locations.
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
