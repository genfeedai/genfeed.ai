import { createHash } from 'node:crypto';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { buildVisualProjectWorkflowDefinition } from '@api/collections/visual-projects/services/visual-project-workflow-definition';
import { SystemWorkflowDefinitionRegistrarService } from '@api/collections/workflows/services/system-workflow-definition-registrar.service';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  buildWorkflowVersionDefinition,
  createVersionedWorkflow,
  type WorkflowDefinitionInput,
} from '@api/collections/workflows/workflow-version-definition';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  collectServiceRegisteredDefinitions,
  collectSystemWorkflowDefinitions,
} from '@api/shared/testing/system-workflow-definition-discovery';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/collections/workflows/workflow-version-definition', async () => {
  const actual = await vi.importActual<
    typeof import('@api/collections/workflows/workflow-version-definition')
  >('@api/collections/workflows/workflow-version-definition');
  return {
    ...actual,
    createVersionedWorkflow: vi.fn(actual.createVersionedWorkflow),
  };
});

/**
 * FROZEN reference: the pre-#5912 local serializer of
 * workflow-version-definition.ts, byte for byte. A nested `undefined` becomes
 * the literal text `undefined`. Never edit this to match the shared helper;
 * the point is to prove the shared helper reproduces the persisted contentHash
 * for every code-authored definition.
 */
function frozenStableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => frozenStableStringify(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${frozenStableStringify(record[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) as string;
}

function frozenContentHash(built: {
  graph: unknown;
  inputSchema: unknown;
}): string {
  return `sha256:v1:${createHash('sha256')
    .update(
      frozenStableStringify({
        graph: built.graph,
        inputSchema: built.inputSchema,
      }),
    )
    .digest('hex')}`;
}

function expectSameHash(label: string, input: WorkflowDefinitionInput): void {
  const built = buildWorkflowVersionDefinition(input);
  expect(built.contentHash, label).toBe(frozenContentHash(built));
}

/**
 * The COMPLETE set of code-authored system workflow definitions. Adding or
 * removing a definition must update this list, so a new definition cannot ship
 * without its contentHash being covered by the proof below.
 */
const EXPECTED_SYSTEM_WORKFLOW_IDS: readonly string[] = [
  'admin.announcement.broadcast',
  'ads.bulk-upload',
  'ads.bulk-upload.create-ad-item',
  'ads.bulk-upload.upload-media-item',
  'ads.google.sync-credential',
  'ads.meta.sync-credential',
  'ads.tiktok.sync-credential',
  'agent-campaign.annotate-orchestration-run',
  'agent-campaign.dispatch-orchestration-run',
  'agent-campaign.dispatch-trigger-group',
  'agent-campaign.dispatch-trigger-run',
  'agent-campaign.evaluate-triggers',
  'agent-campaign.extract-memory',
  'agent-campaign.orchestrate',
  'agent-campaign.persist-trigger-recommendation',
  'agent-campaign.run-due-orchestrations',
  'agent-campaign.run-trigger-evaluations',
  'agent.autopilot.proactive',
  'agent.autopilot.reset-one',
  'agent.autopilot.strategy',
  'agent.thread.input-response',
  'agent.thread.ui-action',
  'agent.tool.ai_action',
  'agent.tool.analyze_performance',
  'agent.tool.archive_knowledge_source',
  'agent.tool.assign_knowledge_purpose',
  'agent.tool.batch_approve_reject',
  'agent.tool.cancel_visual_code_project',
  'agent.tool.capture_knowledge',
  'agent.tool.capture_memory',
  'agent.tool.check_goal_progress',
  'agent.tool.check_onboarding_status',
  'agent.tool.complete_media_upload',
  'agent.tool.complete_onboarding',
  'agent.tool.complete_outreach_sequence',
  'agent.tool.connect_social_account',
  'agent.tool.create_ad_remix_workflow',
  'agent.tool.create_brand',
  'agent.tool.create_brand_from_url',
  'agent.tool.create_goal',
  'agent.tool.create_instagram_remix_workflow',
  'agent.tool.create_livestream_bot',
  'agent.tool.create_outreach_sequence',
  'agent.tool.create_post',
  'agent.tool.create_workflow',
  'agent.tool.discover_engagements',
  'agent.tool.draft_brand_voice_profile',
  'agent.tool.draft_engagement_reply',
  'agent.tool.draft_x_quote',
  'agent.tool.draft_x_repost',
  'agent.tool.duplicate_workflow',
  'agent.tool.enhance_prompt',
  'agent.tool.execute_workflow',
  'agent.tool.export_visual_code_project',
  'agent.tool.generate',
  'agent.tool.generate_ad_pack',
  'agent.tool.generate_as_identity',
  'agent.tool.generate_content',
  'agent.tool.generate_content_batch',
  'agent.tool.generate_monthly_content',
  'agent.tool.generate_onboarding_content',
  'agent.tool.generate_visual_code',
  'agent.tool.get_account',
  'agent.tool.get_ad_research_detail',
  'agent.tool.get_analytics',
  'agent.tool.get_approval_summary',
  'agent.tool.get_brand_completeness',
  'agent.tool.get_brand_context',
  'agent.tool.get_brand_scan_status',
  'agent.tool.get_brands',
  'agent.tool.get_connection_status',
  'agent.tool.get_current_brand',
  'agent.tool.get_dashboard_layout',
  'agent.tool.get_generation_options',
  'agent.tool.get_instagram_inspiration_detail',
  'agent.tool.get_outreach_sequence_analytics',
  'agent.tool.get_posts',
  'agent.tool.get_top_ingredients',
  'agent.tool.get_trends',
  'agent.tool.get_visual_code_catalog',
  'agent.tool.get_visual_code_project',
  'agent.tool.get_workflow_inputs',
  'agent.tool.get_workflow_run',
  'agent.tool.get_x_posts',
  'agent.tool.ingest_source_media',
  'agent.tool.initiate_oauth_connect',
  'agent.tool.inspect_workflow',
  'agent.tool.install_official_workflow',
  'agent.tool.install_system_workflow',
  'agent.tool.link_external_publication_credential',
  'agent.tool.list_ads_research',
  'agent.tool.list_agent_conversations',
  'agent.tool.list_assets',
  'agent.tool.list_genfeed_tools',
  'agent.tool.list_instagram_inspiration',
  'agent.tool.list_knowledge_sources',
  'agent.tool.list_outlier_posts',
  'agent.tool.list_review_queue',
  'agent.tool.list_system_workflow_catalog',
  'agent.tool.list_workflow_runs',
  'agent.tool.list_workflows',
  'agent.tool.list_x_account_activity',
  'agent.tool.manage_livestream_bot',
  'agent.tool.open_studio_handoff',
  'agent.tool.pause_outreach_sequence',
  'agent.tool.prepare_ad_launch_review',
  'agent.tool.prepare_clip_workflow_run',
  'agent.tool.prepare_generation',
  'agent.tool.prepare_voice_clone',
  'agent.tool.prepare_workflow_trigger',
  'agent.tool.present_payment_options',
  'agent.tool.present_work_object',
  'agent.tool.quote_visual_code_generation',
  'agent.tool.rate_content',
  'agent.tool.rate_ingredient',
  'agent.tool.read_knowledge_source',
  'agent.tool.record_external_publication',
  'agent.tool.rename_brand',
  'agent.tool.render_dashboard',
  'agent.tool.replicate_top_ingredient',
  'agent.tool.repurpose_post',
  'agent.tool.request_asset',
  'agent.tool.request_input',
  'agent.tool.request_media_upload',
  'agent.tool.resolve_handle',
  'agent.tool.retry_knowledge_ingestion',
  'agent.tool.retry_visual_code_project',
  'agent.tool.revise_visual_code_project',
  'agent.tool.save_brand_voice_profile',
  'agent.tool.save_dashboard_layout',
  'agent.tool.save_onboarding_answers',
  'agent.tool.scan_brand_url',
  'agent.tool.schedule_post',
  'agent.tool.score_seo',
  'agent.tool.search_knowledge',
  'agent.tool.select_ingredient',
  'agent.tool.set_generation_settings',
  'agent.tool.set_workflow_schedule',
  'agent.tool.skip_brand_interview_question',
  'agent.tool.spawn_content_agent',
  'agent.tool.start_brand_interview',
  'agent.tool.start_outreach_sequence',
  'agent.tool.submit_brand_interview_answer',
  'agent.tool.suggest_ingredient_alternatives',
  'agent.tool.suggest_next_steps',
  'agent.tool.transfer_agent_conversation',
  'agent.tool.transform_media',
  'agent.tool.update_goal',
  'agent.tool.update_strategy_state',
  'agent.turn.execute',
  'ai-influencer.daily-post',
  'ai-influencer.daily-posts',
  'ai-influencer.generate-post',
  'ai-influencer.generate-video',
  'ai-influencer.generate-voice',
  'ai-influencer.publish-platform',
  'analytics-sync',
  'analytics.facebook.collect-item',
  'analytics.generic.sync-item',
  'analytics.organization-refresh',
  'analytics.post-refresh.facebook',
  'analytics.post-refresh.instagram',
  'analytics.post-refresh.linkedin',
  'analytics.post-refresh.mastodon',
  'analytics.post-refresh.pinterest',
  'analytics.post-refresh.threads',
  'analytics.post-refresh.tiktok',
  'analytics.post-refresh.twitter',
  'analytics.post-refresh.youtube',
  'analytics.social.collect-item',
  'analytics.threads.collect-item',
  'analytics.twitter.collect-item',
  'analytics.youtube.collect-item',
  'article.generation',
  'article.generation.one',
  'article.header-prompt',
  'article.review.workflow',
  'author-reply.draft',
  'author-reply.send-reply',
  'batch-project.idea.dispatch',
  'batch-project.idea.dispatch.failure',
  'batch.generation',
  'brand-remix.generate',
  'brand-remix.generate.dispatch-one',
  'brand-remix.generate.resolve-credits',
  'brand-remix.meta.paused-draft',
  'brand-remix.review-handoff',
  'brand-remix.scene-step',
  'brand-remix.x.paused-draft',
  'campaign.dispatch.active',
  'campaign.dm.execute-target',
  'campaign.dm.process-pending-targets',
  'campaign.reply.execute-target',
  'campaign.reply.preview',
  'campaign.reply.process-pending-targets',
  'clip.analysis',
  'clip.analysis.failure',
  'clip.continuity',
  'clip.continuity.failure',
  'clip.continuity.qa-one',
  'clip.factory',
  'clip.factory.failure',
  'clip.generation',
  'clip.generation.one',
  'clip.handoff.editor',
  'clip.handoff.library-link',
  'clip.handoff.publish-prepare',
  'content-intelligence.generation',
  'content-intelligence.generation.one',
  'content-learning.account-rebuild',
  'content-learning.checkpoint',
  'content-learning.dataset-train',
  'content-learning.evaluate',
  'content-learning.reconcile',
  'content-learning.retention',
  'content-loop-autopilot',
  'content.batch.generate-item.content-geo-optimizer',
  'content.batch.generate-item.content-writing',
  'content.batch.generate-item.image-generation',
  'content.batch.generate-item.trend-discovery',
  'content.batch.generate-item.trend-remix',
  'content.batch.generate.content-geo-optimizer',
  'content.batch.generate.content-writing',
  'content.batch.generate.image-generation',
  'content.batch.generate.trend-discovery',
  'content.batch.generate.trend-remix',
  'content.optimization.ab-test.execute',
  'content.optimization.ab-test.execute-arm',
  'content.optimization.ab-test.load-validated',
  'content.optimization.ab-test.resolve',
  'content.optimization.ab-test.resolve-outcome',
  'content.optimization.analyze',
  'content.optimization.apply-suggestion',
  'content.optimization.optimize-prompt',
  'content.optimization.recommend',
  'content.optimization.requeue-winner',
  'content.optimization.suggest',
  'content.production.autopilot',
  'content.production.autopilot.persona',
  'content.production.autopilot.pipeline.image',
  'content.production.autopilot.pipeline.music',
  'content.production.autopilot.pipeline.video',
  'content.production.engine',
  'content.production.engine.brand',
  'content.production.engine.plan',
  'content.production.engine.plan-item',
  'daily-publishing.account',
  'email-digest.deliver-one',
  'email-digest.delivery',
  'email-product-signals.organization',
  'email-product-signals.reconcile',
  'engagement.rule.process',
  'engagement.sweep',
  'evergreen.release.expand',
  'harness.winners.promote',
  'harness.winners.promote.brand',
  'harness.winners.promote.item',
  'insight.generation',
  'knowledge.source.backfill',
  'knowledge.source.ingest',
  'lifecycle-email.cancel-checkout',
  'lifecycle-email.delivery',
  'lifecycle-email.enqueue-delivery',
  'lifecycle-email.organization',
  'lifecycle-email.schedule-delivery',
  'lifecycle-email.scheduling',
  'lifecycle-email.sweep',
  'linkedin-content.generation',
  'linkedin-content.generation.one',
  'livestream.restream.ingest',
  'livestream.sessions.deliver-target',
  'livestream.sessions.process',
  'livestream.sessions.process.one',
  'newsletter.draft-generation',
  'newsletter.topic-generation',
  'paid-creative.research.ingest',
  'paid-creative.research.ingest.advertiser',
  'patterns.extract-organization',
  'patterns.persist-candidate',
  'public-youtube-clip.create',
  'public-youtube-clip.preview',
  'public-youtube-clip.read',
  'reply-bot.process-bot',
  'reply-bot.process-content',
  'reply-bot.process-organization',
  'reply-bot.send-dm',
  'reply-bot.test-generation',
  'reply.inbound.process',
  'reply.polling.bots',
  'reply.polling.bots.target',
  'reply.polling.social-triggers',
  'reply.polling.social-triggers.workflow',
  'reply.post-watch.process',
  'review-gate.timeout.resolve',
  'review-gate.timeout.sweep',
  'rss.item.process',
  'rss.source.process',
  'rss.sweep',
  'scheduled-post.publish',
  'scheduled-post.publish.failure',
  'signup.prefill',
  'skill.content-geo-optimizer',
  'skill.content-writing',
  'skill.image-generation',
  'skill.trend-discovery',
  'skill.trend-remix',
  'social-source.history-import',
  'social-source.own-account-resync',
  'social-source.own-account-resync.item',
  'social.inbox.outbound.post-reply',
  'social.inbox.outbound.send-dm',
  'social.inbox.sync.youtube-comments',
  'social.reply-campaign.dispatch-tick',
  'streak.organization.process',
  'streak.record.process',
  'streak.sweep',
  'telegram.distribution.delivery',
  'tiktok.status.reconcile',
  'tiktok.status.sweep',
  'trends.maintenance.dataset-task',
  'trends.maintenance.refresh',
  'trends.maintenance.scoped-refresh',
  'trends.maintenance.scoped-task',
  'trends.notifications.summary',
  'twitter.pipeline.draft',
  'twitter.pipeline.publish',
  'twitter.pipeline.search',
  'visual-code.execute',
  'voice.generate',
  'workflow.artifact.cleanup.execution',
  'workflow.artifact.cleanup.expired-scope',
  'workflow.artifact.cleanup.sweep',
  'workflow.batch.execute',
  'workspace.task.execute',
  'workspace.task.execute-agent',
  'workspace.task.execute-agent-execution',
  'workspace.task.execute-facecam',
  'youtube-source-to-library',
  'youtube-to-long-form-text',
  'youtube.comments.sweep',
  'youtube.status.reconcile',
  'youtube.status.sweep',
];

/**
 * Files that call registerWorkflow( but contribute no instantiable definition
 * to the sweep, with the reason each is still covered or excluded.
 */
const NON_CONTRIBUTING_REGISTERING_FILES: readonly string[] = [
  // Registers through a register*(runner) export, swept by the module discovery.
  'collections/workflows/services/youtube-long-form-workflow.definitions.ts',
  // Declares registerWorkflow itself.
  'collections/workflows/system-workflow-runner.service.ts',
  // Definitions come from Telegram recipe files loaded at runtime.
  'services/telegram-bot/telegram-bot.service.ts',
  // The discovery helper's own source.
  'shared/testing/system-workflow-definition-discovery.ts',
];

describe('workflow contentHash byte-identity with the pre-#5912 serializer', () => {
  it('matches for every registered system workflow definition', async () => {
    const discovered = await collectSystemWorkflowDefinitions();
    const registered: SystemWorkflowGraphDefinition[] = [];
    new SystemWorkflowDefinitionRegistrarService({
      registerWorkflow: (definition: SystemWorkflowGraphDefinition) => {
        registered.push(definition);
      },
    } as unknown as SystemWorkflowRunnerService).onModuleInit();
    const service = await collectServiceRegisteredDefinitions(
      SystemWorkflowRunnerService,
    );
    const definitions = new Map(
      [...discovered, ...registered, ...service.definitions].map(
        (definition) => [definition.canonicalId, definition],
      ),
    );

    // Every registering source file must contribute, or be explicitly excluded.
    const apiRelative = (file: string) =>
      file.split('/src/').slice(1).join('/src/');
    const missingFiles = service.registeringFiles
      .filter((file) => !service.contributingFiles.includes(file))
      .map((file) => apiRelative(file))
      .sort();
    expect(missingFiles).toEqual(
      [...NON_CONTRIBUTING_REGISTERING_FILES].sort(),
    );

    // Complete, explicit set: fails on both missing and extra definitions.
    expect([...definitions.keys()].sort()).toEqual([
      ...EXPECTED_SYSTEM_WORKFLOW_IDS,
    ]);
    for (const definition of definitions.values()) {
      expectSameHash(definition.canonicalId, definition.definition);
    }
  }, 120_000);

  it('matches for the visual-project definition', () => {
    expectSameHash(
      'visual-code.execute',
      buildVisualProjectWorkflowDefinition().definition,
    );
  });

  it.each([
    ['post', 'credential-1'],
    ['newsletter', null],
    ['image', null],
  ] as const)(
    'matches for the default recurring %s definition (credential %s)',
    async (contentType, credentialId) => {
      const create = vi.mocked(createVersionedWorkflow);
      create.mockClear();
      const service = new DefaultRecurringContentService(
        {} as PrismaService,
        { debug: vi.fn(), log: vi.fn() } as unknown as LoggerService,
        {} as ModuleRef,
      );
      const tx = {
        workflow: {
          create: async () => ({
            id: 'wf-1',
            organizationId: 'org',
            userId: 'u',
          }),
          findFirstOrThrow: async () => ({ id: 'wf-1' }),
        },
        workflowVersion: { create: async () => ({}) },
      };

      await (
        service as unknown as {
          createDefaultRecurringWorkflow: (params: unknown) => Promise<void>;
        }
      ).createDefaultRecurringWorkflow({
        brand: {
          id: 'brand-1',
          label: 'Brand',
          agentConfig: null,
        } as unknown as BrandDocument,
        contentType,
        credentialId,
        organizationId: 'org',
        origin: 'system',
        tx: tx as unknown as PrismaTransactionClient,
        userId: 'user',
      });

      const definitionInput = create.mock.calls[0]?.[2];
      expect(definitionInput).toBeDefined();
      expectSameHash(
        `default-recurring:${contentType}`,
        definitionInput as WorkflowDefinitionInput,
      );
    },
  );

  // Known, intentional difference (#5912): with no connected credential the
  // `post` node config carries `credentialId: undefined`. The old serializer
  // wrote the literal text `undefined` for it; the shared helper writes `null`.
  // Harmless: nothing recomputes and compares a default-recurring workflow's
  // stored hash (editing one just creates a new version), and Vincent accepted
  // hash changes for undefined-bearing inputs.
  it('differs only by undefined vs null for the default recurring post definition without a credential', async () => {
    const create = vi.mocked(createVersionedWorkflow);
    create.mockClear();
    const service = new DefaultRecurringContentService(
      {} as PrismaService,
      { debug: vi.fn(), log: vi.fn() } as unknown as LoggerService,
      {} as ModuleRef,
    );
    const tx = {
      workflow: {
        create: async () => ({
          id: 'wf-1',
          organizationId: 'org',
          userId: 'u',
        }),
        findFirstOrThrow: async () => ({ id: 'wf-1' }),
      },
      workflowVersion: { create: async () => ({}) },
    };
    await (
      service as unknown as {
        createDefaultRecurringWorkflow: (params: unknown) => Promise<void>;
      }
    ).createDefaultRecurringWorkflow({
      brand: {
        id: 'brand-1',
        label: 'Brand',
        agentConfig: null,
      } as unknown as BrandDocument,
      contentType: 'post',
      credentialId: null,
      organizationId: 'org',
      origin: 'system',
      tx: tx as unknown as PrismaTransactionClient,
      userId: 'user',
    });

    const built = buildWorkflowVersionDefinition(
      create.mock.calls[0]?.[2] as WorkflowDefinitionInput,
    );
    expect(frozenStableStringify(built.graph)).toContain(
      '"credentialId":undefined',
    );
    expect(built.contentHash).not.toBe(frozenContentHash(built));
    expect(built.contentHash).toBe(
      `sha256:v1:${createHash('sha256')
        .update(
          frozenStableStringify({
            graph: JSON.parse(
              frozenStableStringify(built.graph).replaceAll(
                '"credentialId":undefined',
                '"credentialId":null',
              ),
            ),
            inputSchema: built.inputSchema,
          }),
        )
        .digest('hex')}`,
    );
  });
});
