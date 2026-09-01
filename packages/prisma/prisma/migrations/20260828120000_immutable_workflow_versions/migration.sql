BEGIN;

-- Workflow version hashes use the same SHA-256 contract as the application.
-- Installation is deliberately fail-closed when the database owner cannot
-- provide pgcrypto; persisting a second hash format would break version identity.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Workflow identity stays mutable; executable definitions become immutable.
CREATE TABLE "workflow_versions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "inputSchema" JSONB NOT NULL DEFAULT '[]',
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_versions_workflowId_version_key"
    ON "workflow_versions"("workflowId", "version");
CREATE INDEX "workflow_versions_organizationId_workflowId_version_idx"
    ON "workflow_versions"("organizationId", "workflowId", "version" DESC);

ALTER TABLE "workflow_versions"
    ADD CONSTRAINT "workflow_versions_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "workflows"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_versions"
    ADD CONSTRAINT "workflow_versions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_versions"
    ADD CONSTRAINT "workflow_versions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only trigger/input/control nodes remain engine-native. Every product node is
-- rewritten to the single action-backed node shape during the hard cut.
CREATE FUNCTION workflow_node_is_engine_native(node_type TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT
        node_type LIKE 'trigger-%'
        OR node_type IN (
            'commentTrigger',
            'condition',
            'control-branch',
            'control-delay',
            'delay',
            'engagementTrigger',
            'input-image',
            'input-video',
            'keywordTrigger',
            'mentionTrigger',
            'newFollowerTrigger',
            'newLikeTrigger',
            'newRepostTrigger',
            'postPublishTrigger',
            'reviewGate',
            'workflowInput'
        );
$$;

CREATE FUNCTION workflow_node_action_id(node_type TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE node_type
        WHEN 'ai-avatar-video' THEN 'aiAvatarVideo'
        WHEN 'ai-generate-image' THEN 'imageGen'
        WHEN 'ai-generate-newsletter' THEN 'newsletterGen'
        WHEN 'ai-generate-post' THEN 'postGen'
        WHEN 'ai-generate-video' THEN 'videoGen'
        WHEN 'ai-lip-sync' THEN 'lipSync'
        WHEN 'ai-llm' THEN 'llm'
        WHEN 'ai-prompt-constructor' THEN 'promptConstructor'
        WHEN 'ai-reframe' THEN 'reframe'
        WHEN 'ai-text-to-speech' THEN 'textToSpeech'
        WHEN 'ai-upscale' THEN 'upscale'
        WHEN 'ai-voice-change' THEN 'voiceChange'
        WHEN 'analytics-feedback' THEN 'analyticsFeedback'
        WHEN 'attach-post-ingredient' THEN 'attachPostIngredient'
        WHEN 'captionGen' THEN 'effect-captions'
        WHEN 'cast-prompt-generator' THEN 'castPrompt'
        WHEN 'download' THEN 'workflow.collect-output'
        WHEN 'effect-color-grade' THEN 'colorGrade'
        WHEN 'generateVideo' THEN 'videoGen'
        WHEN 'output-publish' THEN 'publish'
        WHEN 'outputGallery' THEN 'workflow.collect-output'
        WHEN 'social-post-reply' THEN 'postReply'
        WHEN 'social-send-dm' THEN 'sendDm'
        WHEN 'source-corpus' THEN 'sourceCorpus'
        WHEN 'transcribe' THEN 'ai-transcribe'
        WHEN 'workflow-output' THEN 'workflow.collect-output'
        WHEN 'workflow_output' THEN 'workflow.collect-output'
        WHEN 'workflowOutput' THEN 'workflow.collect-output'
        ELSE node_type
    END;
$$;

-- Frozen deployment-time snapshot of the shared Genfeed action catalog. This is
-- intentionally duplicated only inside the one-time migration: Postgres cannot
-- import the TypeScript registry, and accepting an unknown id would create a
-- version that the hard-cut runtime can never execute.
CREATE FUNCTION workflow_action_is_supported(action_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT action_id IN (
        'ads.bulk-upload.build-media-items',
        'ads.bulk-upload.build-permutations',
        'ads.bulk-upload.claim',
        'ads.bulk-upload.create-ad',
        'ads.bulk-upload.fail',
        'ads.bulk-upload.finalize',
        'ads.bulk-upload.upload-media',
        'ads.credentials.discover',
        'ads.google.performance.fetch',
        'ads.google.performance.normalize',
        'ads.meta.performance.fetch',
        'ads.meta.performance.normalize',
        'ads.optimization.analyze',
        'ads.optimization.finalize',
        'ads.optimization.load-config',
        'ads.optimization.persist-recommendations',
        'ads.performance.persist',
        'ads.tiktok.performance.fetch',
        'ads.tiktok.performance.normalize',
        'ai-enhance',
        'ai-transcribe',
        'aiAvatarVideo',
        'ai-influencer.caption.generate',
        'ai-influencer.daily.discover',
        'ai-influencer.daily.finalize',
        'ai-influencer.daily.mark-run',
        'ai-influencer.daily.prepare',
        'ai-influencer.image.generate',
        'ai-influencer.image.prepare',
        'ai-influencer.ingredient.create',
        'ai-influencer.persona.load',
        'ai-influencer.platform.publish',
        'ai-influencer.post.finalize',
        'ai-influencer.publish.plan',
        'ai-influencer.video.generate',
        'ai-influencer.video.plan',
        'ai-influencer.voice.generate',
        'ai_action',
        'analyticsFeedback',
        'analytics.collection.finalize',
        'analytics.facebook.collect',
        'analytics.generic.detect-alerts',
        'analytics.generic.discover',
        'analytics.generic.persist',
        'analytics.generic.resolve-window',
        'analytics.generic.sync-memory',
        'analytics.posts.discover',
        'analytics.social.collect',
        'analytics.threads.collect',
        'analytics.twitter.collect',
        'analytics.youtube.collect',
        'analyze_clip_project',
        'analyze_performance',
        'approve_social_draft',
        'article.review',
        'article.review.load-context',
        'article.generation.finalize',
        'article.generation.generate-drafts',
        'article.header-prompt.generate',
        'article.header-prompt.load',
        'article.header-prompt.persist',
        'article.generation.invalidate-cache',
        'article.generation.load-context',
        'article.generation.review-draft',
        'article.generation.revise-draft',
        'author-reply.finalize-draft',
        'author-reply.finalize-send',
        'author-reply.generate-draft',
        'author-reply.resolve-credential',
        'author-reply.resolve-intent',
        'author-reply.send',
        'assign_social_conversation',
        'attachPostIngredient',
        'batch_approve_reject',
        'brand',
        'brand-remix.meta.create-ad',
        'brand-remix.meta.ensure-ad-set',
        'brand-remix.meta.ensure-campaign',
        'brand-remix.meta.find-ad',
        'brand-remix.meta.pause-ad',
        'brand-remix.meta.pause-ad-set',
        'brand-remix.meta.pause-campaign',
        'brand-remix.meta.persist-lineage',
        'brand-remix.meta.persist-mapping',
        'brand-remix.meta.prepare-creative',
        'brand-remix.meta.resolve-account',
        'brand-remix.meta.validate-source',
        'brand-remix.review.claim',
        'brand-remix.review.complete',
        'brand-remix.review.create-handoff',
        'brand-remix.review.prepare',
        'brand-remix.review.project',
        'brand-remix.review.record-lineage',
        'brand-remix.x.ensure-campaign',
        'brand-remix.x.ensure-line-item',
        'brand-remix.x.ensure-promoted-tweet',
        'brand-remix.x.persist-lineage',
        'brand-remix.x.persist-mapping',
        'brand-remix.x.resolve-account',
        'brand-remix.x.resolve-funding',
        'brand-remix.x.validate-source',
        'brand-remix.x.validate-tweet',
        'brandAsset',
        'brandContext',
        'campaign.dm.claim',
        'campaign.dm.discover-targets',
        'campaign.dm.finalize',
        'campaign.dm.generate',
        'campaign.dm.reserve',
        'campaign.dm.resolve-context',
        'campaign.dm.send',
        'campaign.dispatch.discover',
        'campaign.dispatch.finalize',
        'campaign.reply.claim',
        'campaign.reply.discover-targets',
        'campaign.reply.finalize',
        'campaign.reply.generate',
        'campaign.reply.load-context',
        'campaign.reply.preview.generate',
        'campaign.reply.preview.validate',
        'campaign.reply.reserve',
        'campaign.reply.send',
        'cancel_agent_run',
        'capture_memory',
        'castPrompt',
        'check_goal_progress',
        'check_onboarding_status',
        'cinematicColorGrade',
        'clip.analysis.detect-highlights',
        'clip.analysis.extract-reference-frames',
        'clip.analysis.fail',
        'clip.analysis.persist',
        'clip.analysis.prepare-source',
        'clip.analysis.transcribe',
        'clip.continuity.begin',
        'clip.continuity.fail',
        'clip.continuity.persist-report',
        'clip.factory.fail',
        'clip.generation.finalize-child',
        'clip.generation.plan',
        'clip.generation.generate-one',
        'clip.handoff.create-editor',
        'clip.handoff.link-library',
        'clip.handoff.prepare-publish',
        'colorGrade',
        'compare_meta_campaigns',
        'complete_campaign',
        'complete_onboarding',
        'connect_social_account',
        'content.batch.item.generate',
        'content.batch.plan',
        'content.batch.rank',
        'content.optimization.ab-test.arm.create',
        'content.optimization.ab-test.execution.finalize',
        'content.optimization.ab-test.execution.plan',
        'content.optimization.ab-test.outcome.persist',
        'content.optimization.ab-test.resolution.finalize',
        'content.optimization.ab-test.resolution.plan',
        'content.optimization.ab-test.validated.load',
        'content.optimization.analysis.derive',
        'content.optimization.cycle.run',
        'content.optimization.prompt.load-context',
        'content.optimization.prompt.optimize',
        'content.optimization.recommendations.derive',
        'content.optimization.suggestion.apply',
        'content.optimization.suggestions.generate',
        'content.optimization.summary.load',
        'content.optimization.winner.requeue',
        'content-intelligence.finalize',
        'content-intelligence.generate',
        'content-intelligence.generate-freeform',
        'content-intelligence.load-context',
        'content-intelligence.load-patterns',
        'content-intelligence.plan',
        'content-intelligence.track-pattern',
        'agent.autopilot.begin',
        'agent.autopilot.discover',
        'agent.autopilot.dispatch-strategy',
        'agent.autopilot.fail',
        'agent.autopilot.finalize',
        'content.production.engine.begin',
        'content.production.engine.discover-brands',
        'content.production.engine.execute-plan',
        'content.production.engine.fail',
        'content.production.engine.finalize',
        'content.production.engine.plan-brand',
        'content.production.autopilot.begin',
        'content.production.autopilot.discover-personas',
        'content.production.autopilot.fail',
        'content.production.autopilot.finalize',
        'content.production.autopilot.process-persona',
        'harness.winners.begin',
        'harness.winners.discover-brands',
        'harness.winners.fail',
        'harness.winners.finalize',
        'harness.winners.promote-brand',
        'livestream.sessions.begin',
        'livestream.sessions.discover',
        'livestream.sessions.fail',
        'livestream.sessions.finalize',
        'livestream.sessions.process-one',
        'livestream.restream.finalize',
        'livestream.restream.load-bot',
        'livestream.restream.sync-chat',
        'paid-creative.research.discover-advertisers',
        'paid-creative.research.finalize',
        'paid-creative.research.ingest-advertiser',
        'paid-creative.research.prepare',
        'reply.polling.bots.begin',
        'reply.polling.bots.discover-targets',
        'reply.polling.bots.fail',
        'reply.polling.bots.finalize',
        'reply.polling.bots.process-target',
        'reply.polling.social.begin',
        'reply.polling.social.discover-workflows',
        'reply.polling.social.fail',
        'reply.polling.social.finalize',
        'reply.polling.social.process-workflow',
        'trends.notifications.deliver-email',
        'trends.notifications.deliver-in-app',
        'trends.notifications.deliver-telegram',
        'trends.notifications.finalize',
        'trends.notifications.prepare',
        'trends.notifications.render',
        'control_scheduled_release',
        'create_ad_remix_workflow',
        'create_article',
        'create_brand',
        'create_campaign',
        'create_chat',
        'create_clip_project_from_youtube',
        'create_goal',
        'create_instagram_remix_workflow',
        'create_livestream_bot',
        'create_post',
        'create_scheduled_release',
        'create_social_reply_draft',
        'create_workflow',
        'discover_engagements',
        'draft_brand_voice_profile',
        'draft_engagement_reply',
        'draft_x_quote',
        'draft_x_repost',
        'duplicate_workflow',
        'effect-captions',
        'effect-ken-burns',
        'effect-portrait-blur',
        'effect-split-screen',
        'effect-text-overlay',
        'effect-watermark',
        'evergreen-release-expansion',
        'execute_workflow',
        'fetch_x_post',
        'filmGrain',
        'generate_ad_pack',
        'generate_as_identity',
        'generate_clips',
        'generate_content',
        'generate_content_batch',
        'generate_image',
        'generate_linkedin_content',
        'generate_monthly_content',
        'generate_music',
        'generate_onboarding_content',
        'generate_video',
        'generate_voice',
        'get_account_info',
        'get_ad_research_detail',
        'get_ads_ad_insights',
        'get_ads_adset_insights',
        'get_agent_run',
        'get_agent_run_content',
        'get_analytics',
        'get_approval_summary',
        'get_article',
        'get_brand',
        'get_brand_completeness',
        'get_campaign_analytics',
        'get_clip_highlights',
        'get_clip_project',
        'get_connection_status',
        'get_content_analytics',
        'get_content_calendar',
        'get_credits_balance',
        'get_current_brand',
        'get_dashboard_layout',
        'get_google_ads_adgroup_insights',
        'get_google_ads_campaign_metrics',
        'get_google_ads_keyword_performance',
        'get_google_ads_search_terms',
        'get_instagram_inspiration_detail',
        'get_job_status',
        'get_linkedin_analytics',
        'get_linkedin_connection_status',
        'get_meta_ad_insights',
        'get_meta_adset_insights',
        'get_meta_campaign_insights',
        'get_meta_top_performers',
        'get_scheduled_release',
        'get_scheduler_capability',
        'get_social_conversation',
        'get_tiktok_campaign_insights',
        'get_tiktok_top_performers',
        'get_top_ingredients',
        'get_trends',
        'get_usage_stats',
        'get_video_analytics',
        'get_video_status',
        'get_workflow_inputs',
        'get_workflow_run',
        'get_workflow_status',
        'hookGenerator',
        'imageGen',
        'initiate_oauth_connect',
        'input-template',
        'inspect_workflow',
        'install_official_workflow',
        'install_system_workflow',
        'iterativeSeoRefine',
        'lensEffects',
        'lipSync',
        'list_ads_research',
        'list_agent_conversations',
        'list_agent_runs',
        'list_avatars',
        'list_brand_publishing_readiness',
        'list_brands',
        'list_characters',
        'list_clip_projects',
        'list_genfeed_tools',
        'list_google_ads_campaigns',
        'list_google_ads_customers',
        'list_images',
        'list_instagram_inspiration',
        'list_meta_ad_accounts',
        'list_meta_ad_creatives',
        'list_meta_campaigns',
        'list_music',
        'list_posts',
        'list_review_queue',
        'list_scheduler_capabilities',
        'list_social_conversations',
        'list_system_workflow_catalog',
        'list_tiktok_ad_accounts',
        'list_tiktok_adgroups',
        'list_tiktok_ads',
        'list_tiktok_campaigns',
        'list_videos',
        'list_workflow_runs',
        'list_workflow_templates',
        'list_workflows',
        'list_x_account_activity',
        'llm',
        'long-form.persist-output',
        'long-form.transform-text',
        'manage_livestream_bot',
        'mark_social_conversation_resolved',
        'musicSource',
        'newsletter.generate-draft',
        'newsletter.generate-topics',
        'newsletter.load-draft-context',
        'newsletter.load-topic-context',
        'newsletter.persist-draft',
        'newsletterGen',
        'open_studio_handoff',
        'output-export',
        'output-notify',
        'output-save',
        'output-webhook',
        'patterns.extraction.build',
        'patterns.extraction.load',
        'patterns.extraction.persist-candidate',
        'patterns.extraction.save-checkpoints',
        'patterns.extraction.scan-ads',
        'patterns.extraction.scan-content',
        'pause_campaign',
        'postGen',
        'postReply',
        'post_social_reply',
        'prepare_ad_launch_review',
        'prepare_clip_workflow_run',
        'prepare_generation',
        'prepare_voice_clone',
        'prepare_workflow_trigger',
        'present_payment_options',
        'process-compress',
        'process-extract-audio',
        'process-merge-videos',
        'process-mirror',
        'process-resize',
        'process-reverse',
        'process-transform',
        'process-trim',
        'promptConstructor',
        'publish',
        'rate_content',
        'rate_ingredient',
        'reframe',
        'reframe_image',
        'reject_social_draft',
        'rename_brand',
        'render_dashboard',
        'replicate_top_ingredient',
        'reply-bot.bot.fetch-candidates',
        'reply-bot.bot.finalize',
        'reply-bot.content.claim',
        'reply-bot.content.finalize',
        'reply-bot.content.generate-dm',
        'reply-bot.content.generate-reply',
        'reply-bot.content.send-reply',
        'reply-bot.dm.finalize',
        'reply-bot.dm.send',
        'reply-bot.organization.discover-bots',
        'reply-bot.organization.finalize',
        'reply-bot.test.finalize',
        'reply-bot.test.load',
        'reply.inbound.finalize',
        'reply.inbound.prepare',
        'reply.post-watch.fetch',
        'reply.post-watch.finalize',
        'reportDelivery',
        'repurpose_post',
        'request_asset',
        'resolve_approval',
        'resolve_handle',
        'retry_agent_run',
        'save_brand_voice_profile',
        'save_dashboard_layout',
        'schedule_post',
        'scheduled-post.claim',
        'scheduled-post.deliver',
        'scheduled-post.fail',
        'scheduled-post.finalize',
        'score_seo',
        'search_articles',
        'search_x_posts',
        'select_ingredient',
        'sendDm',
        'sendEmail',
        'send_chat_message',
        'send_social_dm',
        'seoRewrite',
        'seoScore',
        'set_workflow_schedule',
        'skip_brand_interview_question',
        'social.inbox.outbound.finalize',
        'social.inbox.outbound.provider',
        'social.inbox.outbound.reserve',
        'social.inbox.sync.instagram-comments',
        'social.inbox.sync.instagram-dms',
        'social.inbox.sync.linkedin-comments',
        'social.inbox.sync.linkedin-dms',
        'social.inbox.sync.validate',
        'social.inbox.sync.x-comments',
        'social.inbox.sync.x-dms',
        'social.inbox.sync.youtube-comments',
        'social.reply-campaign.claim',
        'social.reply-campaign.finalize',
        'social.reply-campaign.load',
        'social.reply-campaign.prepare',
        'social.reply-campaign.reclaim',
        'social.reply-campaign.throttle',
        'socialRead',
        'soundOverlay',
        'sourceCorpus',
        'spawn_content_agent',
        'start_brand_interview',
        'start_campaign',
        'submit_brand_interview_answer',
        'suggest_ingredient_alternatives',
        'suggest_next_steps',
        'tag_social_conversation',
        'talkingHeadScript',
        'textToSpeech',
        'transfer_agent_conversation',
        'trendDigest',
        'trendHashtagInspiration',
        'trendSoundInspiration',
        'trendTrigger',
        'trendVideoInspiration',
        'twitter.pipeline.draft.build-prompt',
        'twitter.pipeline.draft.generate',
        'twitter.pipeline.draft.parse',
        'twitter.pipeline.publish.resolve-credential',
        'twitter.pipeline.publish.send',
        'twitter.pipeline.search-recent',
        'update_goal',
        'update_scheduled_release',
        'update_strategy_state',
        'upscale',
        'upscale_image',
        'validate_scheduler_target',
        'videoFrameExtract',
        'videoGen',
        'videoQa',
        'videoStitch',
        'voiceChange',
        'agent-campaign.memory.load-winners',
        'agent-campaign.memory.persist',
        'agent-campaign.orchestration.annotate-run',
        'agent-campaign.orchestration.capture-memory',
        'agent-campaign.orchestration.discover-due',
        'agent-campaign.orchestration.dispatch-run',
        'agent-campaign.orchestration.finalize',
        'agent-campaign.orchestration.load-context',
        'agent-campaign.orchestration.plan',
        'agent-campaign.orchestration.summarize',
        'agent-campaign.triggers.annotate-run',
        'agent-campaign.triggers.discover-due',
        'agent-campaign.triggers.dispatch-run',
        'agent-campaign.triggers.finalize',
        'agent-campaign.triggers.finalize-group',
        'agent-campaign.triggers.load-context',
        'agent-campaign.triggers.persist-recommendation',
        'agent-campaign.triggers.plan-dispatches',
        'agent-campaign.triggers.plan-groups',
        'agent-campaign.triggers.plan-recommendations',
        'batch.generation.mark-queued',
        'batch.generation.process',
        'batch.generation.settle',
        'content.pipeline.generate-image',
        'content.pipeline.generate-music',
        'content.pipeline.generate-speech',
        'content.pipeline.generate-video',
        'content.pipeline.publish',
        'content.pipeline.resolve-context',
        'email-digest.deliver-recipient',
        'email-digest.discover-recipients',
        'email-digest.finalize',
        'email-digest.prepare',
        'email-digest.render',
        'insight.generate-drafts',
        'insight.load-generation-context',
        'insight.persist-generated',
        'knowledge.source.discover-backfill',
        'knowledge.source.chunk',
        'knowledge.source.extract',
        'knowledge.source.finalize',
        'knowledge.source.load',
        'knowledge.source.mark-processing',
        'knowledge.source.replace-chunks',
        'lifecycle-email.check-eligibility',
        'lifecycle-email.deliver',
        'lifecycle-email.finalize',
        'lifecycle-email.load-delivery',
        'lifecycle-email.render',
        'lifecycle-email.scheduling.cancel-checkout',
        'lifecycle-email.scheduling.enqueue-delivery',
        'lifecycle-email.scheduling.finalize',
        'lifecycle-email.scheduling.persist-delivery',
        'lifecycle-email.scheduling.plan',
        'signup.prefill.analyze',
        'signup.prefill.apply-defaults',
        'signup.prefill.apply-prompt',
        'signup.prefill.fail',
        'signup.prefill.finalize',
        'signup.prefill.prepare',
        'signup.prefill.scrape',
        'signup.prefill.seed-harness',
        'telegram.distribution.claim',
        'telegram.distribution.finalize',
        'telegram.distribution.resolve-credential',
        'telegram.distribution.send',
        'workspace.task.agent.decompose',
        'workspace.task.agent.link-runs',
        'workspace.task.agent.plan-runs',
        'workspace.task.agent.record-run',
        'workspace.task.agent.run.create',
        'workspace.task.agent.run.enqueue',
        'workspace.task.facecam.attach-output',
        'workspace.task.facecam.generate',
        'workspace.task.facecam.prepare',
        'workspace.task.facecam.record-dispatch',
        'workspace.task.facecam.record-start',
        'workspace.task.facecam.schedule-poll',
        'workspace.task.finalize',
        'workspace.task.route',
        'engagement.sweep.discover',
        'engagement.sweep.evaluate',
        'engagement.sweep.execute',
        'engagement.sweep.expire',
        'engagement.sweep.finalize-failure',
        'engagement.sweep.finalize-success',
        'engagement.sweep.mark-ineligible',
        'engagement.sweep.publish',
        'review-gate.timeout.discover',
        'review-gate.timeout.resolve',
        'rss.item.claim',
        'rss.item.create-release',
        'rss.item.finalize',
        'rss.item.publish',
        'rss.source.fetch-items',
        'rss.source.finalize',
        'rss.sweep.discover-sources',
        'streak.organization.discover-records',
        'streak.record.apply-freeze',
        'streak.record.break',
        'streak.record.evaluate',
        'streak.record.notify-at-risk',
        'streak.record.notify-broken',
        'streak.record.notify-freeze',
        'streak.sweep.discover-organizations',
        'tiktok.status.discover',
        'tiktok.status.reconcile',
        'trends.maintenance.evaluate-backfill',
        'trends.maintenance.expire-hashtags',
        'trends.maintenance.expire-sounds',
        'trends.maintenance.expire-trends',
        'trends.maintenance.expire-videos',
        'trends.maintenance.fetch-dataset',
        'trends.maintenance.fetch-global',
        'trends.maintenance.fetch-sounds',
        'trends.maintenance.finalize-backfill',
        'trends.maintenance.precompute-preview',
        'workflow.artifact.cleanup',
        'workflow.artifact.cleanup-expired-scope',
        'workflow.artifact.discover-expired',
        'workflow.artifact.promote',
        'workflow.artifact.register',
        'workflow.collect-output',
        'workflow.for-each',
        'workflow.for-each-tenant',
        'workflow.run-child',
        'youtube.comments.discover-credentials',
        'youtube.status.discover-posts',
        'youtube.status.reconcile',
        'youtube.clip.create-session',
        'youtube.clip.dispatch-preview',
        'youtube.clip.read-session',
        'youtube.clip.release-session',
        'youtube.clip.reserve-preview',
        'youtube.create-source-library-asset',
        'youtube.extract-audio',
        'youtube.plan-source-library-asset',
        'youtube.resolve-source',
        'youtube.transcribe-audio'
    );
$$;

-- Catalog membership is necessary but not sufficient: many catalog actions are
-- Agent/MCP tools or removed orchestration macros. Only this deployment-time
-- executor snapshot may survive the hard cut from a persisted legacy graph.
CREATE FUNCTION workflow_action_has_atomic_executor(action_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT action_id IN (
        'ai-enhance',
        'ai-transcribe',
        'aiAvatarVideo',
        'analyticsFeedback',
        'attachPostIngredient',
        'brand',
        'brandAsset',
        'brandContext',
        'castPrompt',
        'cinematicColorGrade',
        'colorGrade',
        'effect-captions',
        'effect-ken-burns',
        'effect-portrait-blur',
        'effect-split-screen',
        'effect-watermark',
        'filmGrain',
        'hookGenerator',
        'imageGen',
        'iterativeSeoRefine',
        'lensEffects',
        'lipSync',
        'llm',
        'musicSource',
        'newsletterGen',
        'postGen',
        'postReply',
        'promptConstructor',
        'publish',
        'reframe',
        'reportDelivery',
        'sendDm',
        'sendEmail',
        'seoRewrite',
        'seoScore',
        'socialRead',
        'soundOverlay',
        'sourceCorpus',
        'talkingHeadScript',
        'textToSpeech',
        'trendDigest',
        'trendHashtagInspiration',
        'trendSoundInspiration',
        'trendTrigger',
        'trendVideoInspiration',
        'upscale',
        'videoFrameExtract',
        'videoGen',
        'videoQa',
        'videoStitch',
        'voiceChange',
        'workflow.collect-output',
        'workflow.for-each',
        'workflow.for-each-tenant',
        'workflow.run-child'
    );
$$;

CREATE FUNCTION workflow_removed_macro_reason(action_id TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN action_id IN (
            'content.optimization.cycle.run'
        ) THEN 'legacy action hides product orchestration and must be rebuilt as explicit workflow nodes'
        WHEN action_id IN (
            'adOptimization',
            'adSyncGoogle',
            'adSyncMeta',
            'adSyncTikTok',
            'agentCampaignOrchestration',
            'agentCampaignTriggerEvaluation',
            'agent-campaign.memory.extract',
            'agent-campaign.orchestration.run',
            'agent-campaign.triggers.evaluate',
            'aiInfluencerDailyPosts',
            'analyticsFacebookSync',
            'analyticsGenericSync',
            'analyticsSocialSync',
            'analyticsThreadsSync',
            'analyticsTwitterSync',
            'brand-remix-paused-meta-draft',
            'brand-remix-paused-x-ads-draft',
            'brand-remix-review-handoff',
            'email-digest.send',
            'insight.generate',
            'knowledge.source.ingest',
            'lifecycle-email.send',
            'review-gate-timeout',
            'signup.prefill.execute',
            'streak-maintenance',
            'telegram.distribution.deliver',
            'tiktok-status-reconciliation',
            'workflow.artifact.cleanup-expired',
            'youtube.obtain-transcript',
            'youtube-comments-ingest',
            'youtube-status-reconciliation',
            'youtubeAnalyticsSync'
        ) THEN 'legacy orchestration action was removed by the hard cut and has no one-node semantic equivalent'
        ELSE NULL
    END;
$$;

-- Before the hard cut, deployment seeding created one immutable per-tenant
-- clone for each product automation. Those clones preserve useful execution
-- history, but their one-node macro graphs were replaced by code-owned explicit
-- system workflows and must never be scheduled by the new runtime. Retire only
-- exact Genfeed-owned seeded clones whose entire graph consists of the removed
-- macro node types observed in that legacy seeder generation.
CREATE FUNCTION workflow_is_retired_seeded_macro_clone(
    workflow_nodes JSONB,
    workflow_metadata JSONB
)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN jsonb_typeof(workflow_nodes) IS DISTINCT FROM 'array'
            OR jsonb_array_length(workflow_nodes) = 0
        THEN FALSE
        ELSE COALESCE(
            jsonb_typeof(workflow_metadata) = 'object'
                AND workflow_metadata->>'sourceType' = 'seeded-template'
                AND NULLIF(workflow_metadata->>'sourceTemplateId', '') IS NOT NULL
                AND jsonb_typeof(workflow_metadata->'systemWorkflow') = 'object'
                AND workflow_metadata->'systemWorkflow'->>'canonicalId'
                    = workflow_metadata->>'sourceTemplateId'
                AND workflow_metadata->'systemWorkflow'->>'kind' = 'system-workflow'
                AND workflow_metadata->'systemWorkflow'->>'owner' = 'genfeed'
                AND workflow_metadata->'systemWorkflow'->'immutable' = 'true'::jsonb
                AND workflow_metadata->'systemWorkflow'->>'visibility' = 'organization'
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(workflow_nodes) AS node
                    WHERE node->>'type' NOT IN (
                        'adOptimization',
                        'adSyncGoogle',
                        'adSyncMeta',
                        'adSyncTikTok',
                        'agentCampaignOrchestration',
                        'agentCampaignTriggerEvaluation',
                        'aiInfluencerDailyPosts',
                        'analyticsFacebookSync',
                        'analyticsGenericSync',
                        'analyticsSocialSync',
                        'analyticsThreadsSync',
                        'analyticsTwitterSync',
                        'contentEngineProduction',
                        'contentPipelineAutopilot',
                        'harnessWinnerPromotionSweep',
                        'livestreamBotSessionProcessing',
                        'outreachCampaignDispatch',
                        'paidCreativeResearchIngestion',
                        'proactiveAgentStrategies',
                        'replyBotPolling',
                        'restreamChatIngest',
                        'socialTriggerPolling',
                        'trendSummaryNotifications',
                        'youtubeAnalyticsSync'
                    )
                ),
            FALSE
        )
    END;
$$;

CREATE FUNCTION workflow_node_parameters(node_data JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL
IMMUTABLE
AS $$
DECLARE
    nested_config JSONB := COALESCE(node_data->'config', '{}'::jsonb);
BEGIN
    IF jsonb_typeof(node_data) <> 'object' THEN
        RAISE EXCEPTION 'Workflow node data must be an object';
    END IF;
    IF jsonb_typeof(nested_config) <> 'object' THEN
        RAISE EXCEPTION 'Workflow node data.config must be an object';
    END IF;

    -- Match WorkflowFormatConverterService.extractParameters: nested config is
    -- the base and real editor data.* fields override it. Runtime-only metadata
    -- is deliberately excluded from executable parameters.
    RETURN nested_config || (
        node_data
        - 'cachedOutput'
        - 'color'
        - 'comment'
        - 'config'
        - 'error'
        - 'inputVariableKeys'
        - 'isLocked'
        - 'label'
        - 'lockTimestamp'
        - 'progress'
        - 'status'
    );
END;
$$;

CREATE FUNCTION workflow_unconvertible_node_reason(node_type TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE node_type
        WHEN 'workflowRef' THEN 'child workflow references require an explicit workflow.run-child contract'
        WHEN 'workflow-ref' THEN 'child workflow references require an explicit workflow.run-child contract'
        WHEN 'resize' THEN 'legacy resize source binding is not equivalent to process-resize inputs'
        WHEN 'clip' THEN 'legacy clip queue semantics have no one-node atomic equivalent'
        WHEN 'webhook' THEN 'legacy webhook payload semantics have no registered atomic executor'
        WHEN 'videoTrim' THEN 'legacy trim source binding is not equivalent to process-trim inputs'
        WHEN 'control-loop' THEN 'legacy loop state must be rebuilt with workflow.for-each and an explicit child workflow'
        WHEN 'motionControl' THEN 'legacy motion-control configuration has no registered atomic executor'
        WHEN 'animation' THEN 'legacy animation configuration has no registered atomic executor'
        WHEN 'imageGridSplit' THEN 'legacy grid-split configuration has no registered atomic executor'
        WHEN 'annotation' THEN 'legacy annotation configuration has no registered atomic executor'
        WHEN 'subtitle' THEN 'legacy subtitle configuration is not equivalent to effect-captions inputs'
        WHEN 'imageCompare' THEN 'legacy image comparison has no registered atomic executor'
        ELSE NULL
    END;
$$;

CREATE FUNCTION workflow_action_node(
    source_node JSONB,
    workflow_id TEXT,
    allow_retired_macro BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE PLPGSQL
IMMUTABLE
AS $$
DECLARE
    node_type TEXT := source_node->>'type';
    action_id TEXT;
    input_type TEXT;
    node_data JSONB := COALESCE(source_node->'data', '{}'::jsonb);
    root_config JSONB := COALESCE(source_node->'config', '{}'::jsonb);
    parameters JSONB;
    rejection_reason TEXT;
BEGIN
    IF jsonb_typeof(source_node) <> 'object' THEN
        RAISE EXCEPTION 'Workflow % nodes must be JSON objects', workflow_id;
    END IF;
    IF NULLIF(source_node->>'id', '') IS NULL THEN
        RAISE EXCEPTION 'Workflow % node has no id', workflow_id;
    END IF;
    IF node_type IS NULL OR node_type = '' THEN
        RAISE EXCEPTION 'Workflow % node % has no type', workflow_id, source_node->>'id';
    END IF;
    IF jsonb_typeof(node_data) <> 'object' THEN
        RAISE EXCEPTION 'Workflow % node % data must be an object', workflow_id, source_node->>'id';
    END IF;
    IF jsonb_typeof(root_config) <> 'object' THEN
        RAISE EXCEPTION 'Workflow % node % config must be an object', workflow_id, source_node->>'id';
    END IF;
    IF node_data ? 'config'
        AND jsonb_typeof(node_data->'config') <> 'object'
    THEN
        RAISE EXCEPTION 'Workflow % node % data.config must be an object', workflow_id, source_node->>'id';
    END IF;

    parameters := root_config || workflow_node_parameters(node_data);

    IF node_type = 'workflow-input' THEN
        source_node := jsonb_set(
            source_node,
            '{type}',
            to_jsonb('workflowInput'::text),
            true
        );
        node_type := 'workflowInput';
    END IF;

    IF node_type IN (
        'audioInput',
        'imageInput',
        'input-prompt',
        'prompt',
        'videoInput'
    ) THEN
        input_type := CASE node_type
            WHEN 'audioInput' THEN 'audio'
            WHEN 'imageInput' THEN 'image'
            WHEN 'input-prompt' THEN 'text'
            WHEN 'prompt' THEN 'text'
            WHEN 'videoInput' THEN 'video'
        END;
        RETURN jsonb_set(
            jsonb_set(
                source_node,
                '{type}',
                to_jsonb('workflowInput'::text),
                true
            ),
            '{data}',
            jsonb_strip_nulls(
                jsonb_build_object(
                    'config',
                    jsonb_strip_nulls(jsonb_build_object(
                        'defaultValue', COALESCE(
                            parameters->input_type,
                            parameters->'prompt',
                            parameters->'defaultValue',
                            parameters->'value'
                        ),
                        'inputName', COALESCE(
                            NULLIF(parameters->>'inputName', ''),
                            source_node->>'id'
                        ),
                        'inputType', input_type,
                        'required', CASE
                            WHEN jsonb_typeof(parameters->'required') = 'boolean'
                            THEN parameters->'required'
                            ELSE 'false'::jsonb
                        END
                    )),
                    'inputVariableKeys', node_data->'inputVariableKeys',
                    'label', COALESCE(node_data->>'label', source_node->>'id')
                )
            ),
            true
        ) - 'config';
    END IF;

    IF workflow_node_is_engine_native(node_type) THEN
        RETURN jsonb_set(
            source_node - 'config',
            '{data}',
            jsonb_strip_nulls(
                jsonb_build_object(
                    'config', parameters,
                    'inputVariableKeys', node_data->'inputVariableKeys',
                    'label', COALESCE(node_data->>'label', node_type)
                )
            ),
            true
        );
    END IF;

    rejection_reason := workflow_unconvertible_node_reason(node_type);
    IF rejection_reason IS NOT NULL AND NOT allow_retired_macro THEN
        RAISE EXCEPTION
            'Workflow % node % has unconvertible legacy type %: %',
            workflow_id,
            source_node->>'id',
            node_type,
            rejection_reason;
    END IF;

    IF node_type = 'genfeedAction' THEN
        IF jsonb_typeof(node_data->'config') <> 'object' THEN
            RAISE EXCEPTION 'Workflow % action node % data.config must be an object', workflow_id, source_node->>'id';
        END IF;
        action_id := workflow_node_action_id(
            node_data->'config'->>'actionId'
        );
        parameters := COALESCE(
            node_data->'config'->'parameters',
            '{}'::jsonb
        );
        IF jsonb_typeof(parameters) <> 'object' THEN
            RAISE EXCEPTION 'Workflow % action node % parameters must be an object', workflow_id, source_node->>'id';
        END IF;
    ELSE
        action_id := workflow_node_action_id(node_type);
    END IF;

    IF action_id IS NULL OR action_id = '' THEN
        RAISE EXCEPTION 'Workflow % action node % has no actionId', workflow_id, source_node->>'id';
    END IF;

    rejection_reason := workflow_removed_macro_reason(action_id);
    IF rejection_reason IS NOT NULL AND NOT allow_retired_macro THEN
        RAISE EXCEPTION
            'Workflow % action node % references removed macro %: %',
            workflow_id,
            source_node->>'id',
            action_id,
            rejection_reason;
    END IF;

    IF NOT allow_retired_macro AND (
        NOT workflow_action_is_supported(action_id)
        OR NOT workflow_action_has_atomic_executor(action_id)
    )
    THEN
        RAISE EXCEPTION
            'Workflow % action node % references unsupported or unregistered atomic action %',
            workflow_id,
            source_node->>'id',
            action_id;
    END IF;

    RETURN jsonb_set(
        jsonb_set(source_node, '{type}', to_jsonb('genfeedAction'::text), true),
        '{data}',
        jsonb_strip_nulls(
            jsonb_build_object(
                'config',
                jsonb_build_object(
                    'actionId', action_id,
                    'parameters', parameters
                ),
                'inputVariableKeys', node_data->'inputVariableKeys',
                'label', COALESCE(node_data->>'label', action_id)
            )
        ),
        true
    ) - 'config';
END;
$$;

CREATE FUNCTION workflow_step_rejection_reason(category TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE category
        WHEN 'transform' THEN 'source-asset queue semantics have no atomic executor equivalent'
        WHEN 'upscale' THEN 'legacy source-asset binding is not represented by the persisted step'
        WHEN 'resize' THEN 'source-asset queue semantics have no atomic executor equivalent'
        WHEN 'caption' THEN 'legacy source-asset queue semantics are not equivalent to effect-captions inputs'
        WHEN 'clip' THEN 'legacy queueClipJob is not equivalent to the MCP-only generate_clips tool'
        WHEN 'publish' THEN 'legacy platform, credential, schedule, and asset inputs differ from the atomic publish contract'
        WHEN 'webhook' THEN 'legacy webhook payload semantics have no registered atomic executor'
        WHEN 'generate-image' THEN 'legacy scheduled generation and persistence semantics differ from imageGen output semantics'
        WHEN 'generate-video' THEN 'legacy scheduled generation and persistence semantics differ from videoGen output semantics'
        WHEN 'generate-music' THEN 'legacy scheduled music generation has no atomic workflow equivalent'
        WHEN 'generate-article' THEN 'legacy topic-based generation is not equivalent to create_article draft persistence'
        WHEN 'color-grade' THEN 'the colorGrade executor is not registered in the hard-cut runtime'
        WHEN 'generate-hook' THEN 'legacy step execution did not define the atomic hookGenerator input contract'
        WHEN 'text-overlay' THEN 'effect-text-overlay has no registered atomic executor'
        WHEN 'image-batch' THEN 'generate_content_batch is an Agent/MCP tool, not an atomic workflow executor'
        WHEN 'performance-track' THEN 'legacy step execution did not define the analyticsFeedback input contract'
        ELSE 'unknown legacy step category'
    END;
$$;

CREATE FUNCTION workflow_stable_json(value JSONB)
RETURNS TEXT
LANGUAGE PLPGSQL
IMMUTABLE
STRICT
AS $$
DECLARE
    result TEXT;
BEGIN
    CASE jsonb_typeof(value)
        WHEN 'object' THEN
            SELECT '{' || COALESCE(
                string_agg(
                    to_jsonb(entry.key)::text || ':' || workflow_stable_json(entry.value),
                    ',' ORDER BY entry.key COLLATE "C"
                ),
                ''
            ) || '}'
            INTO result
            FROM jsonb_each(value) AS entry;
            RETURN result;
        WHEN 'array' THEN
            SELECT '[' || COALESCE(
                string_agg(
                    workflow_stable_json(entry.value),
                    ',' ORDER BY entry.ordinality
                ),
                ''
            ) || ']'
            INTO result
            FROM jsonb_array_elements(value) WITH ORDINALITY AS entry(value, ordinality);
            RETURN result;
        WHEN 'number' THEN
            RETURN trim_scale((value #>> '{}')::numeric)::text;
        ELSE
            RETURN value::text;
    END CASE;
END;
$$;

CREATE FUNCTION workflow_normalize_input_schema(source_schema JSONB, workflow_id TEXT)
RETURNS JSONB
LANGUAGE PLPGSQL
IMMUTABLE
AS $$
DECLARE
    input_record RECORD;
    input_value JSONB;
    input_key TEXT;
    input_type TEXT;
    normalized JSONB := '[]'::jsonb;
BEGIN
    IF jsonb_typeof(source_schema) <> 'array' THEN
        RAISE EXCEPTION 'Workflow % inputVariables must be an array', workflow_id;
    END IF;

    FOR input_record IN
        SELECT value, ordinality
        FROM jsonb_array_elements(source_schema) WITH ORDINALITY
        ORDER BY ordinality
    LOOP
        input_value := input_record.value;
        IF jsonb_typeof(input_value) <> 'object' THEN
            RAISE EXCEPTION 'Workflow % input variable % must be an object', workflow_id, input_record.ordinality;
        END IF;

        input_key := NULLIF(input_value->>'key', '');
        input_type := input_value->>'type';
        IF input_key IS NULL THEN
            RAISE EXCEPTION 'Workflow % input variable % has no key', workflow_id, input_record.ordinality;
        END IF;
        IF input_type IS NULL OR input_type NOT IN (
            'asset', 'audio', 'boolean', 'image', 'number', 'select', 'string', 'text', 'video'
        ) THEN
            RAISE EXCEPTION 'Workflow % input variable % has unsupported type %', workflow_id, input_key, input_type;
        END IF;
        IF NULLIF(input_value->>'label', '') IS NULL THEN
            RAISE EXCEPTION 'Workflow % input variable % has no label', workflow_id, input_key;
        END IF;
        IF input_value ? 'required'
            AND jsonb_typeof(input_value->'required') <> 'boolean'
        THEN
            RAISE EXCEPTION 'Workflow % input variable % required must be boolean', workflow_id, input_key;
        END IF;
        IF input_value ? 'validation'
            AND jsonb_typeof(input_value->'validation') <> 'object'
        THEN
            RAISE EXCEPTION 'Workflow % input variable % validation must be an object', workflow_id, input_key;
        END IF;
        IF input_value ? 'description'
            AND jsonb_typeof(input_value->'description') <> 'string'
        THEN
            RAISE EXCEPTION 'Workflow % input variable % description must be a string', workflow_id, input_key;
        END IF;
        IF input_value->'validation' ? 'min'
            AND jsonb_typeof(input_value->'validation'->'min') <> 'number'
        THEN
            RAISE EXCEPTION 'Workflow % input variable % validation.min must be a number', workflow_id, input_key;
        END IF;
        IF input_value->'validation' ? 'max'
            AND jsonb_typeof(input_value->'validation'->'max') <> 'number'
        THEN
            RAISE EXCEPTION 'Workflow % input variable % validation.max must be a number', workflow_id, input_key;
        END IF;
        IF input_value->'validation' ? 'pattern'
            AND jsonb_typeof(input_value->'validation'->'pattern') <> 'string'
        THEN
            RAISE EXCEPTION 'Workflow % input variable % validation.pattern must be a string', workflow_id, input_key;
        END IF;
        IF input_value->'validation' ? 'options' THEN
            IF jsonb_typeof(input_value->'validation'->'options') IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION 'Workflow % input variable % validation.options must be a string array', workflow_id, input_key;
            END IF;
            IF EXISTS (
                SELECT 1
                FROM jsonb_array_elements(input_value->'validation'->'options') AS option
                WHERE jsonb_typeof(option) <> 'string'
            ) THEN
                RAISE EXCEPTION 'Workflow % input variable % validation.options must be a string array', workflow_id, input_key;
            END IF;
        END IF;

        normalized := normalized || jsonb_build_array(
            input_value || jsonb_build_object(
                'required', COALESCE(input_value->'required', 'false'::jsonb)
            )
        );
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(normalized) AS input
        GROUP BY input->>'key'
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Workflow % inputVariables contains duplicate keys', workflow_id;
    END IF;

    RETURN normalized;
END;
$$;

CREATE FUNCTION workflow_validate_graph(graph_document JSONB, workflow_id TEXT)
RETURNS VOID
LANGUAGE PLPGSQL
IMMUTABLE
AS $$
DECLARE
    graph_nodes JSONB := graph_document->'nodes';
    graph_edges JSONB := graph_document->'edges';
    locked_node_ids JSONB := graph_document->'lockedNodeIds';
    remaining_node_ids TEXT[];
    removable_node_id TEXT;
BEGIN
    IF jsonb_typeof(graph_document) IS DISTINCT FROM 'object'
        OR jsonb_typeof(graph_nodes) IS DISTINCT FROM 'array'
        OR jsonb_typeof(graph_edges) IS DISTINCT FROM 'array'
        OR jsonb_typeof(locked_node_ids) IS DISTINCT FROM 'array'
    THEN
        RAISE EXCEPTION 'Workflow % graph nodes, edges, and lockedNodeIds must be arrays', workflow_id;
    END IF;
    IF jsonb_array_length(graph_nodes) > 500 THEN
        RAISE EXCEPTION 'Workflow % graph exceeds the 500-node limit', workflow_id;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(graph_nodes) AS node
        WHERE jsonb_typeof(node) <> 'object'
            OR NULLIF(node->>'id', '') IS NULL
            OR NULLIF(node->>'type', '') IS NULL
            OR jsonb_typeof(node->'position') IS DISTINCT FROM 'object'
            OR jsonb_typeof(node->'position'->'x') IS DISTINCT FROM 'number'
            OR jsonb_typeof(node->'position'->'y') IS DISTINCT FROM 'number'
            OR jsonb_typeof(node->'data') IS DISTINCT FROM 'object'
            OR NULLIF(node->'data'->>'label', '') IS NULL
            OR jsonb_typeof(node->'data'->'config') IS DISTINCT FROM 'object'
            OR CASE
                WHEN node->'data' ? 'inputVariableKeys'
                THEN CASE
                    WHEN jsonb_typeof(node->'data'->'inputVariableKeys') = 'array'
                    THEN EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements(node->'data'->'inputVariableKeys') AS input_key
                        WHERE jsonb_typeof(input_key) <> 'string'
                    )
                    ELSE true
                END
                ELSE false
            END
    ) THEN
        RAISE EXCEPTION 'Workflow % graph contains a malformed node', workflow_id;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(graph_nodes) AS node
        GROUP BY node->>'id'
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Workflow % graph contains duplicate node ids', workflow_id;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(graph_edges) AS edge
        WHERE jsonb_typeof(edge) <> 'object'
            OR NULLIF(edge->>'id', '') IS NULL
            OR NULLIF(edge->>'source', '') IS NULL
            OR NULLIF(edge->>'target', '') IS NULL
            OR (
                edge ? 'sourceHandle'
                AND jsonb_typeof(edge->'sourceHandle') NOT IN ('null', 'string')
            )
            OR (
                edge ? 'targetHandle'
                AND jsonb_typeof(edge->'targetHandle') NOT IN ('null', 'string')
            )
    ) THEN
        RAISE EXCEPTION 'Workflow % graph contains a malformed edge', workflow_id;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(graph_edges) AS edge
        GROUP BY edge->>'id'
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Workflow % graph contains duplicate edge ids', workflow_id;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(graph_edges) AS edge
        WHERE NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(graph_nodes) AS node
            WHERE node->>'id' = edge->>'source'
        ) OR NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(graph_nodes) AS node
            WHERE node->>'id' = edge->>'target'
        )
    ) THEN
        RAISE EXCEPTION 'Workflow % graph contains a dangling edge', workflow_id;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(locked_node_ids) AS locked(node_id)
        WHERE jsonb_typeof(locked.node_id) <> 'string'
            OR NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(graph_nodes) AS node
                WHERE node->>'id' = locked.node_id #>> '{}'
            )
    ) THEN
        RAISE EXCEPTION 'Workflow % graph contains an unknown locked node id', workflow_id;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(locked_node_ids) AS locked(node_id)
        GROUP BY locked.node_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Workflow % graph contains duplicate locked node ids', workflow_id;
    END IF;
    SELECT COALESCE(
        array_agg(node->>'id' ORDER BY node->>'id' COLLATE "C"),
        ARRAY[]::TEXT[]
    )
    INTO remaining_node_ids
    FROM jsonb_array_elements(graph_nodes) AS node;

    -- Kahn's algorithm avoids enumerating every path in a dense acyclic graph.
    WHILE cardinality(remaining_node_ids) > 0 LOOP
        SELECT candidate.node_id
        INTO removable_node_id
        FROM unnest(remaining_node_ids) AS candidate(node_id)
        WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(graph_edges) AS edge
            WHERE edge->>'target' = candidate.node_id
                AND edge->>'source' = ANY(remaining_node_ids)
        )
        ORDER BY candidate.node_id COLLATE "C"
        LIMIT 1;

        IF removable_node_id IS NULL THEN
            RAISE EXCEPTION 'Workflow % graph contains a cycle', workflow_id;
        END IF;
        remaining_node_ids := array_remove(
            remaining_node_ids,
            removable_node_id
        );
        removable_node_id := NULL;
    END LOOP;
END;
$$;

DO $$
DECLARE
    workflow_row RECORD;
    source_nodes JSONB;
    migrated_nodes JSONB;
    migrated_edges JSONB;
    graph_document JSONB;
    input_schema JSONB;
    step_record RECORD;
    dependency TEXT;
    step_id TEXT;
    rejection_reason TEXT;
    retired_seeded_macro BOOLEAN;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "workflows" workflow
        LEFT JOIN "organizations" organization
            ON organization."id" = workflow."organizationId"
        LEFT JOIN "users" owner
            ON owner."id" = workflow."userId"
        WHERE organization."id" IS NULL OR owner."id" IS NULL
    ) THEN
        RAISE EXCEPTION 'Workflows contain missing tenant owners';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "workflow_executions" execution
        LEFT JOIN "workflows" workflow ON workflow."id" = execution."workflowId"
        WHERE workflow."id" IS NULL
            OR execution."organizationId" <> workflow."organizationId"
            OR execution."userId" <> workflow."userId"
    ) THEN
        RAISE EXCEPTION 'Workflow executions contain orphaned or cross-tenant workflow ownership';
    END IF;

    FOR workflow_row IN
        SELECT * FROM "workflows" ORDER BY "createdAt", "id"
    LOOP
        source_nodes := COALESCE(workflow_row."nodes", '[]'::jsonb);
        retired_seeded_macro := workflow_is_retired_seeded_macro_clone(
            source_nodes,
            workflow_row."metadata"
        );
        IF retired_seeded_macro THEN
            UPDATE "workflows"
            SET "isDeleted" = TRUE,
                "isScheduleEnabled" = FALSE
            WHERE "id" = workflow_row."id";
        END IF;
        IF jsonb_typeof(source_nodes) <> 'array'
            OR jsonb_typeof(COALESCE(workflow_row."edges", '[]'::jsonb)) <> 'array'
            OR jsonb_typeof(COALESCE(workflow_row."steps", '[]'::jsonb)) <> 'array'
            OR jsonb_typeof(COALESCE(workflow_row."lockedNodeIds", '[]'::jsonb)) <> 'array'
        THEN
            RAISE EXCEPTION 'Workflow % legacy nodes, edges, steps, and lockedNodeIds must be arrays', workflow_row."id";
        END IF;

        input_schema := workflow_normalize_input_schema(
            COALESCE(workflow_row."inputVariables", '[]'::jsonb),
            workflow_row."id"
        );

        IF jsonb_array_length(source_nodes) > 0
            AND jsonb_array_length(COALESCE(workflow_row."steps", '[]'::jsonb)) > 0
        THEN
            RAISE EXCEPTION 'Workflow % contains both legacy graph nodes and steps; conversion would discard one executable definition', workflow_row."id";
        END IF;
        IF jsonb_array_length(source_nodes) = 0
            AND jsonb_array_length(COALESCE(workflow_row."edges", '[]'::jsonb)) > 0
        THEN
            RAISE EXCEPTION 'Workflow % has legacy edges without graph nodes', workflow_row."id";
        END IF;

        IF jsonb_array_length(source_nodes) > 0 THEN
            SELECT COALESCE(
                jsonb_agg(
                    workflow_action_node(
                        node,
                        workflow_row."id",
                        retired_seeded_macro
                    )
                    ORDER BY ordinality
                ),
                '[]'::jsonb
            )
            INTO migrated_nodes
            FROM jsonb_array_elements(source_nodes) WITH ORDINALITY AS source(node, ordinality);

            migrated_edges := COALESCE(workflow_row."edges", '[]'::jsonb);
        ELSE
            migrated_nodes := '[]'::jsonb;
            migrated_edges := '[]'::jsonb;

            FOR step_record IN
                SELECT value, ordinality
                FROM jsonb_array_elements(COALESCE(workflow_row."steps", '[]'::jsonb))
                    WITH ORDINALITY
            LOOP
                IF jsonb_typeof(step_record.value) <> 'object' THEN
                    RAISE EXCEPTION 'Workflow % step % must be an object', workflow_row."id", step_record.ordinality;
                END IF;
                step_id := COALESCE(
                    NULLIF(step_record.value->>'id', ''),
                    'step-' || step_record.ordinality::text
                );
                IF NULLIF(step_record.value->>'category', '') IS NULL THEN
                    RAISE EXCEPTION 'Workflow % step % has no category', workflow_row."id", step_id;
                END IF;
                IF step_record.value ? 'config'
                    AND jsonb_typeof(step_record.value->'config') <> 'object'
                THEN
                    RAISE EXCEPTION 'Workflow % step % config must be an object', workflow_row."id", step_id;
                END IF;
                IF step_record.value ? 'dependsOn'
                    AND jsonb_typeof(step_record.value->'dependsOn') <> 'array'
                THEN
                    RAISE EXCEPTION 'Workflow % step % dependsOn must be a string array', workflow_row."id", step_id;
                END IF;
                IF step_record.value ? 'dependsOn'
                    AND EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements(step_record.value->'dependsOn') AS dependency_value
                        WHERE jsonb_typeof(dependency_value) <> 'string'
                    )
                THEN
                    RAISE EXCEPTION 'Workflow % step % dependsOn must be a string array', workflow_row."id", step_id;
                END IF;

                IF step_record.value->>'category' = 'delay' THEN
                    IF step_record.value->'config' ? 'duration'
                        AND (
                            jsonb_typeof(step_record.value->'config'->'duration') <> 'number'
                            OR (step_record.value->'config'->>'duration')::numeric < 0
                            OR (step_record.value->'config'->>'duration')::numeric > 2592000000
                            OR trunc((step_record.value->'config'->>'duration')::numeric)
                                <> (step_record.value->'config'->>'duration')::numeric
                        )
                    THEN
                        RAISE EXCEPTION 'Workflow % step % delay duration must be an integer from 0 to 2592000000 milliseconds', workflow_row."id", step_id;
                    END IF;
                    migrated_nodes := migrated_nodes || jsonb_build_array(
                        jsonb_build_object(
                            'id', step_id,
                            'type', 'control-delay',
                            'position', jsonb_build_object(
                                'x', (step_record.ordinality - 1) * 280,
                                'y', 0
                            ),
                            'data', jsonb_build_object(
                                'label', COALESCE(step_record.value->>'label', 'Delay'),
                                'config', jsonb_build_object(
                                    'duration', COALESCE(
                                        CASE
                                            WHEN jsonb_typeof(step_record.value->'config'->'duration') = 'number'
                                                AND (step_record.value->'config'->>'duration')::numeric > 0
                                            THEN to_jsonb(
                                                (step_record.value->'config'->>'duration')::numeric / 1000
                                            )
                                            ELSE NULL
                                        END,
                                        '1'::jsonb
                                    ),
                                    'mode', 'fixed',
                                    'unit', 'seconds'
                                )
                            )
                        )
                    );
                ELSE
                    rejection_reason := workflow_step_rejection_reason(
                        step_record.value->>'category'
                    );
                    RAISE EXCEPTION
                        'Workflow % step % has unconvertible category %: %',
                        workflow_row."id",
                        step_id,
                        step_record.value->>'category',
                        rejection_reason;
                END IF;

                FOR dependency IN
                    SELECT jsonb_array_elements_text(
                        COALESCE(step_record.value->'dependsOn', '[]'::jsonb)
                    )
                LOOP
                    migrated_edges := migrated_edges || jsonb_build_array(
                        jsonb_build_object(
                            'id', dependency || '-' || step_id,
                            'source', dependency,
                            'target', step_id
                        )
                    );
                END LOOP;
            END LOOP;
        END IF;

        graph_document := jsonb_build_object(
            'nodes', migrated_nodes,
            'edges', migrated_edges,
            'lockedNodeIds', COALESCE(workflow_row."lockedNodeIds", '[]'::jsonb)
        );
        PERFORM workflow_validate_graph(graph_document, workflow_row."id");

        INSERT INTO "workflow_versions" (
            "id",
            "workflowId",
            "organizationId",
            "userId",
            "version",
            "graph",
            "inputSchema",
            "contentHash",
            "createdAt"
        ) VALUES (
            'wv_legacy_' || workflow_row."id",
            workflow_row."id",
            workflow_row."organizationId",
            workflow_row."userId",
            1,
            graph_document,
            input_schema,
            'sha256:v1:' || encode(
                digest(
                    convert_to(
                        workflow_stable_json(
                            jsonb_build_object(
                                'graph', graph_document,
                                'inputSchema', input_schema
                            )
                        ),
                        'UTF8'
                    ),
                    'sha256'
                ),
                'hex'
            ),
            workflow_row."updatedAt"
        );
    END LOOP;
END;
$$;

ALTER TABLE "workflows" ADD COLUMN "currentVersionId" TEXT;
UPDATE "workflows"
SET "currentVersionId" = 'wv_legacy_' || "id";
ALTER TABLE "workflows" ALTER COLUMN "currentVersionId" SET NOT NULL;
CREATE UNIQUE INDEX "workflows_currentVersionId_key"
    ON "workflows"("currentVersionId");
ALTER TABLE "workflows"
    ADD CONSTRAINT "workflows_currentVersionId_fkey"
    FOREIGN KEY ("currentVersionId") REFERENCES "workflow_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "workflow_executions" ADD COLUMN "workflowVersionId" TEXT;
UPDATE "workflow_executions" execution
SET "workflowVersionId" = version."id"
FROM "workflow_versions" version
WHERE version."workflowId" = execution."workflowId"
    AND version."organizationId" = execution."organizationId"
    AND version."userId" = execution."userId"
    AND version."version" = 1;
ALTER TABLE "workflow_executions" ALTER COLUMN "workflowVersionId" SET NOT NULL;
CREATE INDEX "workflow_executions_organizationId_workflowVersionId_createdAt_idx"
    ON "workflow_executions"("organizationId", "workflowVersionId", "createdAt" DESC);
ALTER TABLE "workflow_executions"
    ADD CONSTRAINT "workflow_executions_workflowVersionId_fkey"
    FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "workflows" workflow
        LEFT JOIN "workflow_versions" version
            ON version."id" = workflow."currentVersionId"
            AND version."workflowId" = workflow."id"
            AND version."organizationId" = workflow."organizationId"
            AND version."userId" = workflow."userId"
            AND version."version" = 1
        WHERE version."id" IS NULL
    ) THEN
        RAISE EXCEPTION 'Workflow version backfill did not bind every identity to its tenant-owned v1';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "workflow_executions" execution
        JOIN "workflow_versions" version
            ON version."id" = execution."workflowVersionId"
        WHERE version."workflowId" <> execution."workflowId"
            OR version."organizationId" <> execution."organizationId"
            OR version."userId" <> execution."userId"
    ) THEN
        RAISE EXCEPTION 'Workflow execution version backfill crossed workflow or tenant ownership';
    END IF;
END;
$$;

ALTER TABLE "workflows"
    DROP COLUMN "steps",
    DROP COLUMN "nodes",
    DROP COLUMN "edges",
    DROP COLUMN "inputVariables",
    DROP COLUMN "lockedNodeIds";

DROP FUNCTION workflow_step_rejection_reason(TEXT);
DROP FUNCTION workflow_validate_graph(JSONB, TEXT);
DROP FUNCTION workflow_normalize_input_schema(JSONB, TEXT);
DROP FUNCTION workflow_stable_json(JSONB);
DROP FUNCTION workflow_action_node(JSONB, TEXT, BOOLEAN);
DROP FUNCTION workflow_unconvertible_node_reason(TEXT);
DROP FUNCTION workflow_node_parameters(JSONB);
DROP FUNCTION workflow_removed_macro_reason(TEXT);
DROP FUNCTION workflow_is_retired_seeded_macro_clone(JSONB, JSONB);
DROP FUNCTION workflow_action_has_atomic_executor(TEXT);
DROP FUNCTION workflow_action_is_supported(TEXT);
DROP FUNCTION workflow_node_action_id(TEXT);
DROP FUNCTION workflow_node_is_engine_native(TEXT);

COMMIT;
