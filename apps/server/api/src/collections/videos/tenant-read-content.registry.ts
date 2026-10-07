import { ArticlesController } from '@api/collections/articles/controllers/articles.controller';
import { ArticlesTrafficController } from '@api/collections/articles/controllers/articles-traffic.controller';
import { BotActivitiesController } from '@api/collections/bot-activities/controllers/bot-activities.controller';
import { CampaignsController } from '@api/collections/campaigns/controllers/campaigns.controller';
import { ClipProjectGenerationController } from '@api/collections/clip-projects/clip-project-generation.controller';
import { ClipProjectHighlightsController } from '@api/collections/clip-projects/clip-project-highlights.controller';
import { ClipProjectsController } from '@api/collections/clip-projects/clip-projects.controller';
import { ClipResultsController } from '@api/collections/clip-results/clip-results.controller';
import { CreatorsController } from '@api/collections/content-intelligence/controllers/creators.controller';
import { PatternsController } from '@api/collections/content-intelligence/controllers/patterns.controller';
import { PlaybooksController } from '@api/collections/content-intelligence/controllers/playbooks.controller';
import { ContentLearningController } from '@api/collections/content-learning/controllers/content-learning.controller';
import { AnalyticsSyncController } from '@api/collections/content-performance/controllers/analytics-sync.controller';
import { ContentPerformanceController } from '@api/collections/content-performance/controllers/content-performance.controller';
import { PerformanceSummaryController } from '@api/collections/content-performance/controllers/performance-summary.controller';
import { CreativePatternsController } from '@api/collections/creative-patterns/controllers/creative-patterns.controller';
import { DashboardLayoutsController } from '@api/collections/dashboard-layouts/controllers/dashboard-layouts.controller';
import { DistributionsController } from '@api/collections/distributions/controllers/distributions.controller';
import { EditorProjectsController } from '@api/collections/editor-projects/editor-projects.controller';
import { RemotionCompositionsController } from '@api/collections/editor-projects/remotion-compositions.controller';
import { FontFamiliesController } from '@api/collections/font-families/controllers/font-families.controller';
import { GifsController } from '@api/collections/gifs/controllers/gifs.controller';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientsRelationshipsController } from '@api/collections/ingredients/controllers/ingredients-relationships.controller';
import { InsightsController } from '@api/collections/insights/controllers/insights.controller';
import { McpApprovalsController } from '@api/collections/mcp-approvals/controllers/mcp-approvals.controller';
import { MonitoredAccountsController } from '@api/collections/monitored-accounts/controllers/monitored-accounts.controller';
import { MoodBoardsController } from '@api/collections/mood-boards/controllers/mood-boards.controller';
import { MusicsController } from '@api/collections/musics/controllers/musics.controller';
import { NewslettersController } from '@api/collections/newsletters/controllers/newsletters.controller';
import { OptimizersController } from '@api/collections/optimizers/controllers/optimizers.controller';
import { OutliersController } from '@api/collections/outliers/controllers/outliers.controller';
import { OutreachCampaignTargetsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaign-targets.controller';
import { OutreachCampaignsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaigns.controller';
import { PostGroupsController } from '@api/collections/post-groups/controllers/post-groups.controller';
import { PostingCadencesController } from '@api/collections/posting-cadences/controllers/posting-cadences.controller';
import { ContentMentionsController } from '@api/collections/posts/controllers/content-mentions.controller';
import { PresetsController } from '@api/collections/presets/controllers/presets.controller';
import { PromptsController } from '@api/collections/prompts/controllers/prompts.controller';
import { ReplyBotConfigsController } from '@api/collections/reply-bot-configs/controllers/reply-bot-configs.controller';
import { SavedAdsController } from '@api/collections/saved-ads/controllers/saved-ads.controller';
import { SchedulesController } from '@api/collections/schedules/controllers/schedules.controller';
import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import { SocialReplyCampaignController } from '@api/collections/social-inbox/controllers/social-reply-campaign.controller';
import { TagsController } from '@api/collections/tags/controllers/tags.controller';
import { TemplatesController } from '@api/collections/templates/controllers/templates.controller';
import { TrackedLinksController } from '@api/collections/tracked-links/controllers/tracked-links.controller';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { TrendsAnalyticsController } from '@api/collections/trends/controllers/trends-analytics.controller';
import { TrendsDiscoveryController } from '@api/collections/trends/controllers/trends-discovery.controller';
import { VideosCaptionsController } from '@api/collections/videos/controllers/captions/videos-captions.controller';
import { VideosLiveSessionsController } from '@api/collections/videos/controllers/live-sessions/videos-live-sessions.controller';
import { VideosProvenanceController } from '@api/collections/videos/controllers/provenance/videos-provenance.controller';
import { VideosRelationshipsController } from '@api/collections/videos/controllers/relationships/videos-relationships.controller';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import { VisualProjectsController } from '@api/collections/visual-projects/controllers/visual-projects.controller';
import { AdsResearchController } from '@api/endpoints/ads-research/ads-research.controller';
import { CostReportingController } from '@api/endpoints/cost-reporting/cost-reporting.controller';
import { FacebookController } from '@api/services/integrations/facebook/controllers/facebook.controller';
import { GoogleAdsController } from '@api/services/integrations/google-ads/controllers/google-ads.controller';
import { GoogleSearchConsoleController } from '@api/services/integrations/google-search-console/controllers/google-search-console.controller';
import { MetaAdsController } from '@api/services/integrations/meta-ads/controllers/meta-ads.controller';
import { MetaAdsBulkController } from '@api/services/integrations/meta-ads/controllers/meta-ads-bulk.controller';
import { MetaAdsOptimizationController } from '@api/services/integrations/meta-ads/controllers/meta-ads-optimization.controller';
import { UnipileController } from '@api/services/integrations/unipile/controllers/unipile.controller';
import { WhatsappController } from '@api/services/integrations/whatsapp/controllers/whatsapp.controller';
import { DesktopSyncController } from '@api/services/sync/desktop-sync.controller';
import { SyncController } from '@api/services/sync/sync.controller';

export const TENANT_READ_CONTENT_ROUTES = [
  {
    controller: AdsResearchController,
    handler: 'listAds',
    route: '/v1/ads/research',
    policy: 'selected',
  },
  {
    controller: ArticlesController,
    handler: 'getVersions',
    route: '/v1/articles/{articleId}/versions',
    policy: 'owner',
  },
  {
    controller: ArticlesTrafficController,
    handler: 'getTraffic',
    route: '/v1/articles/{articleId}/website-traffic',
    policy: 'selected',
  },
  {
    controller: BotActivitiesController,
    handler: 'findAll',
    route: '/v1/bot-activities',
    policy: 'selected',
  },
  {
    controller: BotActivitiesController,
    handler: 'getStats',
    route: '/v1/bot-activities/stats/summary',
    policy: 'selected',
  },
  {
    controller: BotActivitiesController,
    handler: 'findOne',
    route: '/v1/bot-activities/{id}',
    policy: 'selected',
  },
  {
    controller: CampaignsController,
    handler: 'getOne',
    route: '/v1/campaigns/{id}',
    policy: 'selected',
  },
  {
    controller: CampaignsController,
    handler: 'listActivations',
    route: '/v1/campaigns/{id}/activations',
    policy: 'selected',
  },
  {
    controller: CampaignsController,
    handler: 'getPerformance',
    route: '/v1/campaigns/{id}/performance',
    policy: 'selected',
  },
  {
    controller: ClipProjectsController,
    handler: 'findOne',
    route: '/v1/clip-projects/{id}',
    policy: 'mutating',
  },
  {
    controller: ClipProjectHighlightsController,
    handler: 'getHighlights',
    route: '/v1/clip-projects/{projectId}/highlights',
    policy: 'selected',
  },
  {
    controller: ClipProjectGenerationController,
    handler: 'getHookClipApproval',
    route: '/v1/clip-projects/{projectId}/hook-approval',
    policy: 'selected',
  },
  {
    controller: ClipResultsController,
    handler: 'findAll',
    route: '/v1/clip-results',
    policy: 'selected',
  },
  {
    controller: ClipResultsController,
    handler: 'findOne',
    route: '/v1/clip-results/{id}',
    policy: 'selected',
  },
  {
    controller: CreatorsController,
    handler: 'findAll',
    route: '/v1/content-intelligence/creators',
    policy: 'selected',
  },
  {
    controller: CreatorsController,
    handler: 'findOne',
    route: '/v1/content-intelligence/creators/{id}',
    policy: 'selected',
  },
  {
    controller: PatternsController,
    handler: 'findAll',
    route: '/v1/content-intelligence/patterns',
    policy: 'selected',
  },
  {
    controller: PatternsController,
    handler: 'findOne',
    route: '/v1/content-intelligence/patterns/{id}',
    policy: 'selected',
  },
  {
    controller: PlaybooksController,
    handler: 'findAll',
    route: '/v1/content-intelligence/playbooks',
    policy: 'selected',
  },
  {
    controller: PlaybooksController,
    handler: 'findOne',
    route: '/v1/content-intelligence/playbooks/{id}',
    policy: 'selected',
  },
  {
    controller: ContentLearningController,
    handler: 'accountsList',
    route: '/v1/content-learning/accounts',
    policy: 'owner',
  },
  {
    controller: ContentLearningController,
    handler: 'account',
    route: '/v1/content-learning/accounts/{credentialId}',
    policy: 'owner',
  },
  {
    controller: ContentLearningController,
    handler: 'evidence',
    route: '/v1/content-learning/accounts/{credentialId}/evidence',
    policy: 'owner',
  },
  {
    controller: ContentLearningController,
    handler: 'decision',
    route: '/v1/content-learning/decisions/{id}',
    policy: 'owner',
  },
  {
    controller: ContentLearningController,
    handler: 'policy',
    route: '/v1/content-learning/policies/{id}',
    policy: 'owner',
  },
  {
    controller: ContentLearningController,
    handler: 'postDecision',
    route: '/v1/content-learning/posts/{postId}/decision',
    policy: 'owner',
  },
  {
    controller: ContentPerformanceController,
    handler: 'query',
    route: '/v1/content-performance',
    policy: 'selected',
  },
  {
    controller: ContentPerformanceController,
    handler: 'getAggregated',
    route: '/v1/content-performance/aggregate/{generationId}',
    policy: 'selected',
  },
  {
    controller: AnalyticsSyncController,
    handler: 'getSyncStatus',
    route: '/v1/content-performance/analytics-sync/status',
    policy: 'selected',
  },
  {
    controller: ContentPerformanceController,
    handler: 'getStrategyRanking',
    route: '/v1/content-performance/attribution/ranking',
    policy: 'selected',
  },
  {
    controller: ContentPerformanceController,
    handler: 'getAttribution',
    route: '/v1/content-performance/attribution/{generationId}',
    policy: 'selected',
  },
  {
    controller: PerformanceSummaryController,
    handler: 'getGenerationContext',
    route: '/v1/content-performance/summary/generation-context',
    policy: 'selected',
  },
  {
    controller: PerformanceSummaryController,
    handler: 'getPromptPerformance',
    route: '/v1/content-performance/summary/prompt-performance',
    policy: 'selected',
  },
  {
    controller: PerformanceSummaryController,
    handler: 'getTopPerformers',
    route: '/v1/content-performance/summary/top-performers',
    policy: 'selected',
  },
  {
    controller: PerformanceSummaryController,
    handler: 'getWeeklySummary',
    route: '/v1/content-performance/summary/weekly',
    policy: 'selected',
  },
  {
    controller: ContentPerformanceController,
    handler: 'findOne',
    route: '/v1/content-performance/{id}',
    policy: 'selected',
  },
  {
    controller: ContentMentionsController,
    handler: 'getMentions',
    route: '/v1/content/mentions',
    policy: 'selected',
  },
  {
    controller: CostReportingController,
    handler: 'getWorkflows',
    route: '/v1/costs/workflows',
    policy: 'selected',
  },
  {
    controller: CreativePatternsController,
    handler: 'findAll',
    route: '/v1/creative-patterns',
    policy: 'selected',
  },
  {
    controller: DashboardLayoutsController,
    handler: 'findForPage',
    route: '/v1/dashboard-layouts',
    policy: 'selected',
  },
  {
    controller: DistributionsController,
    handler: 'list',
    route: '/v1/distributions',
    policy: 'selected',
  },
  {
    controller: DistributionsController,
    handler: 'findOne',
    route: '/v1/distributions/{id}',
    policy: 'selected',
  },
  {
    controller: EditorProjectsController,
    handler: 'findOne',
    route: '/v1/editor-projects/{id}',
    policy: 'selected',
  },
  {
    controller: FontFamiliesController,
    handler: 'findAll',
    route: '/v1/font-families',
    policy: 'selected',
  },
  {
    controller: GifsController,
    handler: 'findOne',
    route: '/v1/gifs/{gifId}',
    policy: 'selected',
  },
  {
    controller: ImagesController,
    handler: 'findOne',
    route: '/v1/images/{imageId}',
    policy: 'selected',
  },
  {
    controller: IngredientsController,
    handler: 'getBatch',
    route: '/v1/ingredients/batch',
    policy: 'selected',
  },
  {
    controller: IngredientsRelationshipsController,
    handler: 'findMadeFrom',
    route: '/v1/ingredients/{ingredientId}/lineage/made-from',
    policy: 'selected',
  },
  {
    controller: IngredientsRelationshipsController,
    handler: 'findUsedIn',
    route: '/v1/ingredients/{ingredientId}/lineage/used-in',
    policy: 'selected',
  },
  {
    controller: InsightsController,
    handler: 'getInsights',
    route: '/v1/insights',
    policy: 'mutating',
  },
  {
    controller: McpApprovalsController,
    handler: 'findAll',
    route: '/v1/mcp-approvals',
    policy: 'selected',
  },
  {
    controller: McpApprovalsController,
    handler: 'findOne',
    route: '/v1/mcp-approvals/{id}',
    policy: 'selected',
  },
  {
    controller: SocialReplyCampaignController,
    handler: 'list',
    route: '/v1/message-campaigns',
    policy: 'selected',
  },
  {
    controller: SocialReplyCampaignController,
    handler: 'get',
    route: '/v1/message-campaigns/{campaignId}',
    policy: 'selected',
  },
  {
    controller: SocialReplyCampaignController,
    handler: 'listRecipients',
    route: '/v1/message-campaigns/{campaignId}/recipients',
    policy: 'selected',
  },
  {
    controller: SocialInboxController,
    handler: 'getConversation',
    route: '/v1/messages/{conversationId}',
    policy: 'selected',
  },
  {
    controller: SocialInboxController,
    handler: 'listMessages',
    route: '/v1/messages/{conversationId}/messages',
    policy: 'selected',
  },
  {
    controller: MonitoredAccountsController,
    handler: 'findOne',
    route: '/v1/monitored-accounts/{id}',
    policy: 'selected',
  },
  {
    controller: MoodBoardsController,
    handler: 'findByBrand',
    route: '/v1/mood-boards',
    policy: 'mutating',
  },
  {
    controller: MusicsController,
    handler: 'findOne',
    route: '/v1/musics/{id}',
    policy: 'selected',
  },
  {
    controller: NewslettersController,
    handler: 'findOne',
    route: '/v1/newsletters/{id}',
    policy: 'selected',
  },
  {
    controller: NewslettersController,
    handler: 'context',
    route: '/v1/newsletters/{id}/context',
    policy: 'selected',
  },
  {
    controller: OptimizersController,
    handler: 'getOptimizationHistory',
    route: '/v1/optimizers/history',
    policy: 'owner',
  },
  {
    controller: OutliersController,
    handler: 'list',
    route: '/v1/outlier-baselines',
    policy: 'selected',
  },
  {
    controller: OutliersController,
    handler: 'getConfiguration',
    route: '/v1/outlier-baselines/configuration',
    policy: 'selected',
  },
  {
    controller: OutliersController,
    handler: 'rankedPosts',
    route: '/v1/outlier-baselines/posts',
    policy: 'selected',
  },
  {
    controller: OutliersController,
    handler: 'findOne',
    route: '/v1/outlier-baselines/{id}',
    policy: 'selected',
  },
  {
    controller: OutliersController,
    handler: 'posts',
    route: '/v1/outlier-baselines/{id}/posts',
    policy: 'selected',
  },
  {
    controller: OutreachCampaignsController,
    handler: 'findOne',
    route: '/v1/outreach-campaigns/{id}',
    policy: 'selected',
  },
  {
    controller: OutreachCampaignsController,
    handler: 'getAnalytics',
    route: '/v1/outreach-campaigns/{id}/analytics',
    policy: 'selected',
  },
  {
    controller: OutreachCampaignTargetsController,
    handler: 'getTargets',
    route: '/v1/outreach-campaigns/{id}/targets',
    policy: 'selected',
  },
  {
    controller: PostGroupsController,
    handler: 'findAll',
    route: '/v1/post-groups',
    policy: 'selected',
  },
  {
    controller: PostGroupsController,
    handler: 'getOne',
    route: '/v1/post-groups/{id}',
    policy: 'selected',
  },
  {
    controller: PostingCadencesController,
    handler: 'list',
    route: '/v1/posting-cadences',
    policy: 'selected',
  },
  {
    controller: PresetsController,
    handler: 'findAll',
    route: '/v1/presets',
    policy: 'selected',
  },
  {
    controller: PromptsController,
    handler: 'findOne',
    route: '/v1/prompts/{promptId}',
    policy: 'selected',
  },
  {
    controller: RemotionCompositionsController,
    handler: 'status',
    route: '/v1/remotion-compositions/{id}',
    policy: 'owner',
  },
  {
    controller: ReplyBotConfigsController,
    handler: 'getAuthorReplyInbox',
    route: '/v1/reply-bot-configs/author-reply/inbox',
    policy: 'mutating',
  },
  {
    controller: ReplyBotConfigsController,
    handler: 'findOne',
    route: '/v1/reply-bot-configs/{id}',
    policy: 'selected',
  },
  {
    controller: SavedAdsController,
    handler: 'list',
    route: '/v1/saved-ads',
    policy: 'selected',
  },
  {
    controller: SchedulesController,
    handler: 'getCalendar',
    route: '/v1/schedules/calendar',
    policy: 'selected',
  },
  {
    controller: FacebookController,
    handler: 'getUserPages',
    route: '/v1/services/facebook/pages',
    policy: 'selected',
  },
  {
    controller: GoogleAdsController,
    handler: 'getAdGroupInsights',
    route: '/v1/services/google-ads/ad-groups/{id}/insights',
    policy: 'owner',
  },
  {
    controller: GoogleAdsController,
    handler: 'listCampaigns',
    route: '/v1/services/google-ads/campaigns',
    policy: 'owner',
  },
  {
    controller: GoogleAdsController,
    handler: 'getCampaignMetrics',
    route: '/v1/services/google-ads/campaigns/{id}/metrics',
    policy: 'owner',
  },
  {
    controller: GoogleAdsController,
    handler: 'listCustomers',
    route: '/v1/services/google-ads/customers',
    policy: 'owner',
  },
  {
    controller: GoogleAdsController,
    handler: 'getKeywordPerformance',
    route: '/v1/services/google-ads/keywords',
    policy: 'owner',
  },
  {
    controller: GoogleAdsController,
    handler: 'getSearchTerms',
    route: '/v1/services/google-ads/search-terms/{campaignId}',
    policy: 'owner',
  },
  {
    controller: GoogleSearchConsoleController,
    handler: 'getSearchAnalytics',
    route: '/v1/services/google-search-console/search-analytics',
    policy: 'owner',
  },
  {
    controller: GoogleSearchConsoleController,
    handler: 'listSites',
    route: '/v1/services/google-search-console/sites',
    policy: 'owner',
  },
  {
    controller: MetaAdsController,
    handler: 'getAdAccounts',
    route: '/v1/services/meta-ads/accounts',
    policy: 'owner',
  },
  {
    controller: MetaAdsController,
    handler: 'getAdInsights',
    route: '/v1/services/meta-ads/ads/{id}/insights',
    policy: 'owner',
  },
  {
    controller: MetaAdsController,
    handler: 'getAdSetInsights',
    route: '/v1/services/meta-ads/adsets/{id}/insights',
    policy: 'owner',
  },
  {
    controller: MetaAdsBulkController,
    handler: 'listJobs',
    route: '/v1/services/meta-ads/bulk/jobs',
    policy: 'selected',
  },
  {
    controller: MetaAdsBulkController,
    handler: 'getJobStatus',
    route: '/v1/services/meta-ads/bulk/jobs/{id}',
    policy: 'selected',
  },
  {
    controller: MetaAdsController,
    handler: 'listCampaigns',
    route: '/v1/services/meta-ads/campaigns',
    policy: 'owner',
  },
  {
    controller: MetaAdsController,
    handler: 'compareCampaigns',
    route: '/v1/services/meta-ads/campaigns/compare',
    policy: 'owner',
  },
  {
    controller: MetaAdsController,
    handler: 'getCampaignInsights',
    route: '/v1/services/meta-ads/campaigns/{id}/insights',
    policy: 'owner',
  },
  {
    controller: MetaAdsController,
    handler: 'getAdCreatives',
    route: '/v1/services/meta-ads/creatives',
    policy: 'owner',
  },
  {
    controller: MetaAdsOptimizationController,
    handler: 'listAuditLogs',
    route: '/v1/services/meta-ads/optimization/audit-logs',
    policy: 'selected',
  },
  {
    controller: MetaAdsOptimizationController,
    handler: 'getConfig',
    route: '/v1/services/meta-ads/optimization/config',
    policy: 'selected',
  },
  {
    controller: MetaAdsOptimizationController,
    handler: 'listRecommendations',
    route: '/v1/services/meta-ads/optimization/recommendations',
    policy: 'selected',
  },
  {
    controller: MetaAdsController,
    handler: 'getTopPerformers',
    route: '/v1/services/meta-ads/top-performers',
    policy: 'owner',
  },
  {
    controller: UnipileController,
    handler: 'accounts',
    route: '/v1/services/unipile/accounts',
    policy: 'selected',
  },
  {
    controller: UnipileController,
    handler: 'calendarEvents',
    route: '/v1/services/unipile/calendar/events',
    policy: 'selected',
  },
  {
    controller: UnipileController,
    handler: 'emails',
    route: '/v1/services/unipile/emails',
    policy: 'selected',
  },
  {
    controller: UnipileController,
    handler: 'messages',
    route: '/v1/services/unipile/messages',
    policy: 'selected',
  },
  {
    controller: UnipileController,
    handler: 'status',
    route: '/v1/services/unipile/status',
    policy: 'selected',
  },
  {
    controller: WhatsappController,
    handler: 'getMessageStatus',
    route: '/v1/services/whatsapp/status/{messageSid}',
    policy: 'selected',
  },
  {
    controller: DesktopSyncController,
    handler: 'getBrandManifest',
    route: '/v1/sync/desktop/brand-manifest',
    policy: 'selected',
  },
  {
    controller: SyncController,
    handler: 'getStatus',
    route: '/v1/sync/status',
    policy: 'selected',
  },
  {
    controller: TagsController,
    handler: 'findLibrary',
    route: '/v1/tags/library',
    policy: 'selected',
  },
  {
    controller: TemplatesController,
    handler: 'findAll',
    route: '/v1/templates',
    policy: 'selected',
  },
  {
    controller: TemplatesController,
    handler: 'findOne',
    route: '/v1/templates/{templateId}',
    policy: 'selected',
  },
  {
    controller: TrackedLinksController,
    handler: 'getContentCTAStats',
    route: '/v1/tracking/content/{contentId}/cta-stats',
    policy: 'selected',
  },
  {
    controller: TrackedLinksController,
    handler: 'getLinks',
    route: '/v1/tracking/links',
    policy: 'selected',
  },
  {
    controller: TrackedLinksController,
    handler: 'getLink',
    route: '/v1/tracking/links/{id}',
    policy: 'selected',
  },
  {
    controller: TrackedLinksController,
    handler: 'getLinkPerformance',
    route: '/v1/tracking/links/{id}/performance',
    policy: 'selected',
  },
  {
    controller: TrendsController,
    handler: 'getTrends',
    route: '/v1/trends',
    policy: 'selected',
  },
  {
    controller: TrendsDiscoveryController,
    handler: 'getTrendContent',
    route: '/v1/trends/content',
    policy: 'selected',
  },
  {
    controller: TrendsDiscoveryController,
    handler: 'getTrendsDiscovery',
    route: '/v1/trends/discovery',
    policy: 'selected',
  },
  {
    controller: TrendsAnalyticsController,
    handler: 'getViralVideos',
    route: '/v1/trends/videos',
    policy: 'selected',
  },
  {
    controller: TrendsController,
    handler: 'getTrendById',
    route: '/v1/trends/{id}',
    policy: 'selected',
  },
  {
    controller: TrendsController,
    handler: 'getTrendSources',
    route: '/v1/trends/{id}/sources',
    policy: 'selected',
  },
  {
    controller: VideosLiveSessionsController,
    handler: 'getSession',
    route: '/v1/videos/live-sessions/{sessionId}',
    policy: 'mutating',
  },
  {
    controller: VideosController,
    handler: 'findOne',
    route: '/v1/videos/{videoId}',
    policy: 'selected',
  },
  {
    controller: VideosCaptionsController,
    handler: 'getCaptions',
    route: '/v1/videos/{videoId}/captions',
    policy: 'selected',
  },
  {
    controller: VideosRelationshipsController,
    handler: 'findAllPosts',
    route: '/v1/videos/{videoId}/posts',
    policy: 'owner',
  },
  {
    controller: VideosProvenanceController,
    handler: 'getProvenance',
    route: '/v1/videos/{videoId}/provenance',
    policy: 'selected',
  },
  {
    controller: VideosProvenanceController,
    handler: 'getWatermarkEvaluation',
    route: '/v1/videos/{videoId}/provenance/watermark-evaluation',
    policy: 'selected',
  },
  {
    controller: VisualProjectsController,
    handler: 'catalog',
    route: '/v1/visual-projects/catalog',
    policy: 'owner',
  },
  {
    controller: VisualProjectsController,
    handler: 'list',
    route: '/v1/visual-projects/projects',
    policy: 'owner',
  },
  {
    controller: VisualProjectsController,
    handler: 'get',
    route: '/v1/visual-projects/{id}',
    policy: 'owner',
  },
] as const;
