/**
 * App Module (Main Application)
 * Root module that imports and configures all feature modules, database connections,
 * authentication, queues, cron jobs, and shared services. Entry point for the NestJS app.
 */

import { join } from 'node:path';
import process from 'node:process';
import { AuthModule } from '@api/auth/auth.module';
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AgentCampaignsModule } from '@api/collections/agent-campaigns/agent-campaigns.module';
import { AgentMemoriesModule } from '@api/collections/agent-memories/agent-memories.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { ArticlesModule } from '@api/collections/articles/articles.module';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { AvatarsModule } from '@api/collections/avatars/avatars.module';
import { BookmarksModule } from '@api/collections/bookmarks/bookmarks.module';
import { BotsModule } from '@api/collections/bots/bots.module';
import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { BusinessAnalyticsModule } from '@api/collections/business-analytics/business-analytics.module';
import { CaptionsModule } from '@api/collections/captions/captions.module';
import { ClipProjectsModule } from '@api/collections/clip-projects/clip-projects.module';
import { ClipResultsModule } from '@api/collections/clip-results/clip-results.module';
import { ContentDraftsModule } from '@api/collections/content-drafts/content-drafts.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { ContentPlanItemsModule } from '@api/collections/content-plan-items/content-plan-items.module';
import { ContentPlansModule } from '@api/collections/content-plans/content-plans.module';
import { ContentRunsModule } from '@api/collections/content-runs/content-runs.module';
import { ContentSchedulesModule } from '@api/collections/content-schedules/content-schedules.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { CronJobsModule } from '@api/collections/cron-jobs/cron-jobs.module';
import { CustomersModule } from '@api/collections/customers/customers.module';
import { DistributionsModule } from '@api/collections/distributions/distributions.module';
import { EditorProjectsModule } from '@api/collections/editor-projects/editor-projects.module';
import { ElementsBlacklistsModule } from '@api/collections/elements/blacklists/blacklists.module';
import { ElementsCameraMovementsModule } from '@api/collections/elements/camera-movements/camera-movements.module';
import { ElementsCamerasModule } from '@api/collections/elements/cameras/cameras.module';
import { ElementsModule } from '@api/collections/elements/elements.module';
import { ElementsLensesModule } from '@api/collections/elements/lenses/lenses.module';
import { ElementsLightingsModule } from '@api/collections/elements/lightings/lightings.module';
import { ElementsMoodsModule } from '@api/collections/elements/moods/moods.module';
import { ElementsScenesModule } from '@api/collections/elements/scenes/scenes.module';
import { ElementsSoundsModule } from '@api/collections/elements/sounds/sounds.module';
import { ElementsStylesModule } from '@api/collections/elements/styles/styles.module';
import { EvaluationsModule } from '@api/collections/evaluations/evaluations.module';
import { FanvueDataModule } from '@api/collections/fanvue-data/fanvue-data.module';
import { FoldersModule } from '@api/collections/folders/folders.module';
import { FontFamiliesModule } from '@api/collections/font-families/font-families.module';
import { GifsModule } from '@api/collections/gifs/gifs.module';
import { GoalsModule } from '@api/collections/goals/goals.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { InsightsModule } from '@api/collections/insights/insights.module';
import { LinksModule } from '@api/collections/links/links.module';
import { MembersModule } from '@api/collections/members/members.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { NewslettersModule } from '@api/collections/newsletters/newsletters.module';
import { OptimizersModule } from '@api/collections/optimizers/optimizers.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { PresetsModule } from '@api/collections/presets/presets.module';
import { ProfilesModule } from '@api/collections/profiles/profiles.module';
import { ProjectsModule } from '@api/collections/projects/projects.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { RolesModule } from '@api/collections/roles/roles.module';
import { RunsModule } from '@api/collections/runs/runs.module';
import { SchedulesModule } from '@api/collections/schedules/schedules.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { SpeechModule } from '@api/collections/speech/speech.module';
import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { SubscriptionAttributionsModule } from '@api/collections/subscription-attributions/subscription-attributions.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { TagsModule } from '@api/collections/tags/tags.module';
import { TasksModule } from '@api/collections/tasks/tasks.module';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { TrackedLinksModule } from '@api/collections/tracked-links/tracked-links.module';
import { TrainingsModule } from '@api/collections/trainings/trainings.module';
import { TranscriptsModule } from '@api/collections/transcripts/transcripts.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { UserSubscriptionsModule } from '@api/collections/user-subscriptions/user-subscriptions.module';
import { UsersModule } from '@api/collections/users/users.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { VideoTransformationsModule } from '@api/collections/videos/video-transformations.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { VoicesModule } from '@api/collections/voices/voices.module';
import { VotesModule } from '@api/collections/votes/votes.module';
import { WatchlistsModule } from '@api/collections/watchlists/watchlists.module';
import { WorkflowExecutionsModule } from '@api/collections/workflow-executions/workflow-executions.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { LocalIdentityInterceptor } from '@api/common/interceptors/local-identity.interceptor';
import { OrgPrefixMiddleware } from '@api/common/middleware/org-prefix.middleware';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { AdminModule } from '@api/endpoints/admin/admin.module';
import { AdsResearchModule } from '@api/endpoints/ads-research/ads-research.module';
import { AiActionsModule } from '@api/endpoints/ai-actions/ai-actions.module';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { CoreModule } from '@api/endpoints/core/core.module';
import { DevModule } from '@api/endpoints/dev/dev.module';
import { DocsModule } from '@api/endpoints/docs/docs.module';
import { IntegrationsModule } from '@api/endpoints/integrations/integrations.module';
import { OnboardingModule } from '@api/endpoints/onboarding/onboarding.module';
import { PublicModule } from '@api/endpoints/public/public.module';
import { SystemModule } from '@api/endpoints/system/system.module';
import { HookRemixModule } from '@api/endpoints/v1/hook-remix/hook-remix.module';
import { WebhooksModule } from '@api/endpoints/webhooks/webhooks.module';
import { FeatureFlagModule } from '@api/feature-flag/feature-flag.module';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CombinedAuthGuard } from '@api/helpers/guards/combined-auth/combined-auth.guard';
import { MemoryModule } from '@api/helpers/memory/memory.module';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { ClerkClientProvider } from '@api/providers/clerk.provider';
import { QueuesModule } from '@api/queues/core/queues.module';
import { SelfHostedSeedModule } from '@api/seeds/self-hosted-seed.module';
import { AdsGatewayModule } from '@api/services/ads-gateway/ads-gateway.module';
import { AgentCampaignOrchestratorModule } from '@api/services/agent-campaign/agent-campaign-orchestrator.module';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { AgentThreadingModule } from '@api/services/agent-threading/agent-threading.module';
import { AiInfluencerModule } from '@api/services/ai-influencer/ai-influencer.module';
import { BatchContentModule } from '@api/services/batch-content/batch-content.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { CacheModule } from '@api/services/cache/cache.module';
import { ContentEngineModule } from '@api/services/content-engine/content-engine.module';
import { ContentGatewayModule } from '@api/services/content-gateway/content-gateway.module';
import { ContentOptimizationModule } from '@api/services/content-optimization/content-optimization.module';
import { ContentOrchestrationModule } from '@api/services/content-orchestration/content-orchestration.module';
import { BeehiivModule } from '@api/services/integrations/beehiiv/beehiiv.module';
import { DiscordModule } from '@api/services/integrations/discord/discord.module';
import { GhostModule } from '@api/services/integrations/ghost/ghost.module';
import { HedraModule } from '@api/services/integrations/hedra/hedra.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
import { HiggsFieldModule } from '@api/services/integrations/higgsfield/higgsfield.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { LinkedInModule } from '@api/services/integrations/linkedin/linkedin.module';
import { MastodonModule } from '@api/services/integrations/mastodon/mastodon.module';
import { MediumModule } from '@api/services/integrations/medium/medium.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { OpusProModule } from '@api/services/integrations/opuspro/opuspro.module';
import { PinterestModule } from '@api/services/integrations/pinterest/pinterest.module';
import { RedditModule } from '@api/services/integrations/reddit/reddit.module';
import { ShopifyModule } from '@api/services/integrations/shopify/shopify.module';
import { SnapchatModule } from '@api/services/integrations/snapchat/snapchat.module';
import { SolanaModule } from '@api/services/integrations/solana/solana.module';
import { TelegramModule } from '@api/services/integrations/telegram/telegram.module';
import { ThreadsModule } from '@api/services/integrations/threads/threads.module';
import { TiktokModule } from '@api/services/integrations/tiktok/tiktok.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { WhatsappModule } from '@api/services/integrations/whatsapp/whatsapp.module';
import { WordpressModule } from '@api/services/integrations/wordpress/wordpress.module';
import { XaiModule } from '@api/services/integrations/xai/xai.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { YoutubeUploadCompletionModule } from '@api/services/integrations/youtube/youtube-upload-completion.module';
import { MicroservicesModule } from '@api/services/microservices/microservices.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PreflightModule } from '@api/services/preflight/preflight.module';
import { RouterModule as ModelRouterModule } from '@api/services/router/router.module';
import { SkillExecutorModule } from '@api/services/skill-executor/skill-executor.module';
import { DesktopSyncModule } from '@api/services/sync/desktop-sync.module';
import { SyncModule } from '@api/services/sync/sync.module';
import { TelegramBotModule } from '@api/services/telegram-bot/telegram-bot.module';
import { TwitterPipelineModule } from '@api/services/twitter-pipeline/twitter-pipeline.module';
import { VideoCompletionModule } from '@api/services/video-completion/video-completion.module';
import { WorkflowExecutorModule } from '@api/services/workflow-executor/workflow-executor.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { RateLimitModule } from '@api/shared/modules/rate-limit/rate-limit.module';
import { EventBusModule } from '@api/shared/services/event-bus/event-bus.module';
import { SharedModule } from '@api/shared/shared.module';
import { SkillsProModule } from '@api/skills-pro/skills-pro.module';
import { CiTriageWebhookModule } from '@api/webhooks/ci-triage/ci-triage-webhook.module';
import { AgentWorkflowsModule } from '@api/workflows/agent-workflows.module';
import { isEEEnabled } from '@genfeedai/config';
import { HealthModule } from '@libs/health/health.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { RedisModule } from '@libs/redis/redis.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TerminusModule } from '@nestjs/terminus';
import { SentryModule } from '@sentry/nestjs/setup';

@Module({
  controllers: [],
  imports: [
    // Core Infrastructure
    ConfigModule,
    LoggerModule,
    CacheModule,
    RateLimitModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    SharedModule,
    PrismaModule,
    EventBusModule,
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    TerminusModule,
    FeatureFlagModule,
    SystemModule,
    ServeStaticModule.forRoot({
      exclude: ['/v1/{*path}', '/openapi.json'],
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
    }),

    // Docs (OpenAPI, GPT Actions)
    DocsModule,

    // Database Collections (alphabetical)
    AgentCampaignsModule,
    AgentThreadsModule,
    AgentMemoriesModule,
    AgentRunsModule,
    AgentThreadingModule,
    AgentStrategiesModule,
    ActivitiesModule,
    ApiKeysModule,
    ArticlesModule,
    AssetsModule,
    AuthModule,
    AvatarsModule,
    BookmarksModule,
    // BusinessAnalyticsModule — EE (gated below)
    BotsModule,
    BrandMemoryModule,
    BrandsModule,
    OutreachCampaignsModule,
    CronJobsModule,
    CaptionsModule,
    ClipProjectsModule,
    EditorProjectsModule,
    ClipResultsModule,
    ContentDraftsModule,
    ContentPlanItemsModule,
    ContentPlansModule,
    ContentIntelligenceModule,
    ContentPerformanceModule,
    ContentRunsModule,
    ContentSchedulesModule,
    SkillsModule,
    ContextsModule,
    CreativePatternsModule,
    CredentialsModule,
    DistributionsModule,
    CustomersModule,
    ElementsBlacklistsModule,
    ElementsCameraMovementsModule,
    ElementsCamerasModule,
    ElementsLensesModule,
    ElementsLightingsModule,
    ElementsMoodsModule,
    ElementsModule,
    ElementsScenesModule,
    ElementsSoundsModule,
    ElementsStylesModule,
    EvaluationsModule,
    FanvueDataModule,
    FoldersModule,
    FontFamiliesModule,
    GifsModule,
    HarnessProfilesModule,
    HealthModule,
    HookRemixModule,
    ImagesModule,
    GoalsModule,
    IngredientsModule,
    InsightsModule,
    TasksModule,
    LinksModule,
    MarketplaceIntegrationModule,
    MembersModule,
    MetadataModule,
    ModelsModule,
    MusicsModule,
    NewslettersModule,
    OptimizersModule,
    OrganizationSettingsModule,
    OrganizationsModule,
    PersonasModule,
    PostsModule,
    PresetsModule,
    ProfilesModule,
    ProjectsModule,
    PromptsModule,
    RolesModule,
    RunsModule,
    SchedulesModule,
    SettingsModule,
    SpeechModule,
    StreaksModule,
    SubscriptionAttributionsModule,
    SubscriptionsModule,
    TagsModule,
    TemplatesModule,
    TrainingsModule,
    TranscriptsModule,
    TrackedLinksModule,
    TrendsModule,
    UsersModule,
    VideoGenerationModule,
    VideoTransformationsModule,
    VideosModule,
    VoicesModule,
    VotesModule,
    WatchlistsModule,

    // Workflow & Tasks
    WorkflowExecutionsModule,
    AgentWorkflowsModule,
    PreflightModule,
    WorkflowExecutorModule,
    WorkflowsModule,

    // Services (alphabetical)
    BeehiivModule,
    // CreditsModule — EE (gated below)
    DiscordModule,
    GhostModule,
    HedraModule,
    HeyGenModule,
    InstagramModule,
    IntegrationsModule,
    LinkedInModule,
    MastodonModule,

    OpusProModule,

    // Onboarding
    OnboardingModule,
    MediumModule,
    MicroservicesModule,
    ModelRouterModule,
    NotificationsModule,
    NotificationsPublisherModule,
    PinterestModule,
    PublicModule,
    RedditModule,
    ShopifyModule,
    SnapchatModule,
    SolanaModule,
    TelegramModule,
    TelegramBotModule,
    ThreadsModule,
    TiktokModule,
    TwitterModule,
    // UserSubscriptionsModule — EE (gated below)
    VideoCompletionModule,
    WebhooksModule,
    WhatsappModule,
    WordpressModule,
    XaiModule,
    YoutubeModule,
    YoutubeUploadCompletionModule,

    // Batch Generation
    BatchContentModule,
    BatchGenerationModule,

    // Content Engine (plan + execute + review orchestration)
    ContentEngineModule,

    // Content Gateway + Skill Execution
    ContentGatewayModule,
    SkillExecutorModule,

    // Content Orchestration (AI influencer pipeline)
    ContentOrchestrationModule,

    // Content Optimization (closed-loop feedback)
    ContentOptimizationModule,

    // Higgsfield (multi-model I2V)
    HiggsFieldModule,

    // AI Influencer Pipeline
    AiInfluencerModule,

    // Agent Campaign Orchestration
    AgentCampaignOrchestratorModule,

    // Agent Orchestrator
    AgentOrchestratorModule,

    // MCPModule,

    // AI Actions
    AiActionsModule,

    // Core (workflow generation, providers, studio import, tools)
    CoreModule,
    OpenRouterModule,

    // Twitter Pipeline
    TwitterPipelineModule,

    // Skills Pro
    SkillsProModule,

    // Admin
    AdminModule,

    // Views
    AdsResearchModule,
    AnalyticsModule,

    // Memory monitoring
    MemoryModule,

    // Ads Gateway (unified cross-platform ads API)
    AdsGatewayModule,

    // Queues
    QueuesModule,

    // CI Triage webhook (Opus 4.6 diagnosis from localhost)
    CiTriageWebhookModule,

    // Sync (push/pull workflows between local and cloud in HYBRID mode)
    SyncModule,
    DesktopSyncModule,

    // Self-hosted seed (creates default workspace on first boot)
    SelfHostedSeedModule,

    // Dev-only modules (only registered in development)
    ...(process.env.NODE_ENV === 'development' ? [DevModule] : []),

    // EE-only modules (require GENFEED_LICENSE_KEY)
    ...(isEEEnabled()
      ? [CreditsModule, UserSubscriptionsModule, BusinessAnalyticsModule]
      : []),
  ],
  providers: [
    ClerkClientProvider,
    OrgPrefixMiddleware,
    RequestContextMiddleware,
    RequestContextCacheService,
    ClerkGuard,
    ApiKeyAuthGuard,
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LocalIdentityInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
    consumer.apply(OrgPrefixMiddleware).forRoutes('*path');
  }
}
