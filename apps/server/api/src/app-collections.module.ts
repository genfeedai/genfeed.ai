/** Collection HTTP and persistence modules registered by the API process. */

import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AdWatchedAdvertisersModule } from '@api/collections/ad-watched-advertisers/ad-watched-advertisers.module';
import { AgentCampaignsModule } from '@api/collections/agent-campaigns/agent-campaigns.module';
import { AgentMemoriesModule } from '@api/collections/agent-memories/agent-memories.module';
import { AgentPublishAuditsModule } from '@api/collections/agent-publish-audits/agent-publish-audits.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { AgentTransfersModule } from '@api/collections/agent-transfers/agent-transfers.module';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { ArticlesModule } from '@api/collections/articles/articles.module';
import { AssetsModule } from '@api/collections/assets/assets.module';
import { AvatarsModule } from '@api/collections/avatars/avatars.module';
import { BillingAccountsModule } from '@api/collections/billing-accounts/billing-accounts.module';
import { BookmarksModule } from '@api/collections/bookmarks/bookmarks.module';
import { BotsModule } from '@api/collections/bots/bots.module';
import { BrandMemoryModule } from '@api/collections/brand-memory/brand-memory.module';
import { BrandInterviewModule } from '@api/collections/brands/brand-interview/brand-interview.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CampaignsModule } from '@api/collections/campaigns/campaigns.module';
import { CaptionsModule } from '@api/collections/captions/captions.module';
import { ClipProjectsModule } from '@api/collections/clip-projects/clip-projects.module';
import { ClipResultsModule } from '@api/collections/clip-results/clip-results.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { ContentPlanItemsModule } from '@api/collections/content-plan-items/content-plan-items.module';
import { ContentPlansModule } from '@api/collections/content-plans/content-plans.module';
import { ContentRunsModule } from '@api/collections/content-runs/content-runs.module';
import { ContextsModule } from '@api/collections/contexts/contexts.module';
import { CreativePatternsModule } from '@api/collections/creative-patterns/creative-patterns.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { CustomersModule } from '@api/collections/customers/customers.module';
import { DashboardLayoutsModule } from '@api/collections/dashboard-layouts/dashboard-layouts.module';
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
import { EngagementRulesModule } from '@api/collections/engagement-rules/engagement-rules.module';
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
import { LaunchCopyModule } from '@api/collections/launch-copy/launch-copy.module';
import { LinksModule } from '@api/collections/links/links.module';
import { ListeningTopicsModule } from '@api/collections/listening-topics/listening-topics.module';
import { McpApprovalsModule } from '@api/collections/mcp-approvals/mcp-approvals.module';
import { MembersModule } from '@api/collections/members/members.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { MoodBoardsModule } from '@api/collections/mood-boards/mood-boards.module';
import { MusicsModule } from '@api/collections/musics/musics.module';
import { NewslettersModule } from '@api/collections/newsletters/newsletters.module';
import { OptimizersModule } from '@api/collections/optimizers/optimizers.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { OutreachCampaignsModule } from '@api/collections/outreach-campaigns/outreach-campaigns.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { PostGroupsModule } from '@api/collections/post-groups/post-groups.module';
import { PostingCadencesModule } from '@api/collections/posting-cadences/posting-cadences.module';
import { PostingSetsModule } from '@api/collections/posting-sets/posting-sets.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { PresetsModule } from '@api/collections/presets/presets.module';
import { ProfilesModule } from '@api/collections/profiles/profiles.module';
import { ProjectsModule } from '@api/collections/projects/projects.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { PublishingSetupModule } from '@api/collections/publishing-setup/publishing-setup.module';
import { ReferralsModule } from '@api/collections/referrals/referrals.module';
import { RolesModule } from '@api/collections/roles/roles.module';
import { RssSourcesModule } from '@api/collections/rss-sources/rss-sources.module';
import { SavedAdsModule } from '@api/collections/saved-ads/saved-ads.module';
import { SchedulesModule } from '@api/collections/schedules/schedules.module';
import { SettingsModule } from '@api/collections/settings/settings.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { SocialInboxModule } from '@api/collections/social-inbox/social-inbox.module';
import { SocialSourcesModule } from '@api/collections/social-sources/social-sources.module';
import { SocialWarmupEnrollmentsModule } from '@api/collections/social-warmup-enrollments/social-warmup-enrollments.module';
import { SourcePostsModule } from '@api/collections/source-posts/source-posts.module';
import { SpeechModule } from '@api/collections/speech/speech.module';
import { StreaksModule } from '@api/collections/streaks/streaks.module';
import { StudioLooksModule } from '@api/collections/studio-looks/studio-looks.module';
import { SubscriptionAttributionsModule } from '@api/collections/subscription-attributions/subscription-attributions.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { TagsModule } from '@api/collections/tags/tags.module';
import { TasksModule } from '@api/collections/tasks/tasks.module';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { TrackedLinksModule } from '@api/collections/tracked-links/tracked-links.module';
import { TrainingsModule } from '@api/collections/trainings/trainings.module';
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
import { HookRemixModule } from '@api/endpoints/v1/hook-remix/hook-remix.module';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { AgentThreadingModule } from '@api/services/agent-threading/agent-threading.module';
import { PreflightModule } from '@api/services/preflight/preflight.module';
import { AgentWorkflowsModule } from '@api/workflows/agent-workflows.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    AgentCampaignsModule,
    AgentThreadsModule,
    AgentTransfersModule,
    AgentMemoriesModule,
    AgentPublishAuditsModule,
    AgentThreadingModule,
    AgentStrategiesModule,
    ActivitiesModule,
    ApiKeysModule,
    ArticlesModule,
    AssetsModule,
    AvatarsModule,
    BookmarksModule,
    BotsModule,
    BrandMemoryModule,
    BrandInterviewModule,
    BrandsModule,
    OutreachCampaignsModule,
    CampaignsModule,
    CaptionsModule,
    ClipProjectsModule,
    EditorProjectsModule,
    ClipResultsModule,
    ContentPlanItemsModule,
    ContentPlansModule,
    ContentIntelligenceModule,
    ContentPerformanceModule,
    LaunchCopyModule,
    ContentRunsModule,
    SkillsModule,
    ContextsModule,
    CreativePatternsModule,
    CredentialsModule,
    BillingAccountsModule,
    CreditsModule,
    DashboardLayoutsModule,
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
    EngagementRulesModule,
    FanvueDataModule,
    FoldersModule,
    FontFamiliesModule,
    GifsModule,
    HarnessProfilesModule,
    HookRemixModule,
    ImagesModule,
    GoalsModule,
    IngredientsModule,
    InsightsModule,
    TasksModule,
    LinksModule,
    ListeningTopicsModule,
    MarketplaceIntegrationModule,
    McpApprovalsModule,
    MembersModule,
    MetadataModule,
    ModelsModule,
    MoodBoardsModule,
    MusicsModule,
    NewslettersModule,
    OptimizersModule,
    OrganizationSettingsModule,
    OrganizationsModule,
    PersonasModule,
    PostGroupsModule,
    PostingCadencesModule,
    PostingSetsModule,
    PostsModule,
    PublishApprovalsModule,
    PublishingSetupModule,
    PresetsModule,
    ProfilesModule,
    ProjectsModule,
    PromptsModule,
    ReferralsModule,
    RolesModule,
    RssSourcesModule,
    SchedulesModule,
    SavedAdsModule,
    SettingsModule,
    SpeechModule,
    SocialInboxModule,
    SocialSourcesModule,
    SocialWarmupEnrollmentsModule,
    SourcePostsModule,
    StreaksModule,
    StudioLooksModule,
    SubscriptionAttributionsModule,
    SubscriptionsModule,
    UserSubscriptionsModule,
    TagsModule,
    TemplatesModule,
    TrainingsModule,
    TrackedLinksModule,
    TrendsModule,
    UsersModule,
    VideoGenerationModule,
    VideoTransformationsModule,
    VideosModule,
    VoicesModule,
    VotesModule,
    WatchlistsModule,
    AdWatchedAdvertisersModule,
    WorkflowExecutionsModule,
    AgentWorkflowsModule,
    PreflightModule,
    WorkflowsModule,
  ],
})
export class AppCollectionsModule {}
