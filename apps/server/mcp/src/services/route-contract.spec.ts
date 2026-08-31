import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getToolsForSurface } from '@genfeedai/actions';
import { AgentToolName } from '@genfeedai/interfaces';

/**
 * Route-contract test (PR 5/6). The MCP server is a thin HTTP proxy: every tool
 * handler calls a path on the main API. Nothing in the type system links the
 * client path the MCP calls to a route the API actually mounts, so a rename or
 * a wrong prefix ships a tool the server advertises but that 404s at call time
 * (the "dead-wired" class this PR fixes — e.g. the client called
 * `/integrations/*-ads/*` while the controllers mount `/services/*-ads/*`).
 *
 * This spec is that missing link. For every MCP-surfaced tool it declares the
 * `{ method, path }` the client hits and the controller that must mount it, then
 * statically verifies the controller source really declares that
 * `@Controller(prefix)` + method decorator. It is deliberately source-based (no
 * API boot, no DB) so it runs in the MCP package's focused suite; it goes RED if
 * a depended-on route is renamed, moved, or deleted.
 *
 * The boot-time drift guard (PR 2/6) proves tool→executor coverage; this proves
 * executor→mounted-route. Together they close the dead-wiring gap.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const apiSrc = path.resolve(here, '../../../api/src');

/** A tool that dispatches through the agent-executor to a single shared route. */
const BASE_CRUD_LIST = '__BASE_CRUD_LIST__';

/**
 * Controllers the MCP proxy depends on. `prefix` is the `@Controller(...)`
 * argument (after the global `v1` prefix); `baseCrud` marks controllers that
 * inherit their collection routes from `BaseCRUDController`.
 */
const API_CONTROLLERS: Record<string, { file: string; prefix: string }> = {
  agentTools: {
    file: 'services/agent-orchestrator/agent-tools.controller.ts',
    prefix: 'agent-tools',
  },
  agentThreads: {
    file: 'collections/agent-threads/controllers/agent-threads.controller.ts',
    prefix: 'agent/threads',
  },
  approvals: {
    file: 'collections/mcp-approvals/controllers/mcp-approvals.controller.ts',
    prefix: 'mcp-approvals',
  },
  videos: {
    file: 'collections/videos/controllers/videos.controller.ts',
    prefix: 'videos',
  },
  images: {
    file: 'collections/images/controllers/images.controller.ts',
    prefix: 'images',
  },
  avatars: {
    file: 'collections/avatars/controllers/avatars.controller.ts',
    prefix: 'avatars',
  },
  musics: {
    file: 'collections/musics/controllers/musics.controller.ts',
    prefix: 'musics',
  },
  articles: {
    file: 'collections/articles/controllers/articles.controller.ts',
    prefix: 'articles',
  },
  articleOperations: {
    file: 'collections/articles/controllers/operations/articles-operations.controller.ts',
    prefix: 'articles',
  },
  credits: {
    file: 'collections/credits/controllers/credits.controller.ts',
    prefix: 'credits',
  },
  credentials: {
    file: 'collections/credentials/controllers/credentials.controller.ts',
    prefix: 'credentials',
  },
  credentialsPublishing: {
    file: 'collections/credentials/controllers/credentials-publishing.controller.ts',
    prefix: 'credentials',
  },
  contentIntelGenerate: {
    file: 'collections/content-intelligence/controllers/generate.controller.ts',
    prefix: 'content-intelligence/generate',
  },
  contentPerformance: {
    file: 'collections/content-performance/controllers/content-performance.controller.ts',
    prefix: 'content-performance',
  },
  brands: {
    file: 'collections/brands/controllers/brands.controller.ts',
    prefix: 'brands',
  },
  authWhoami: {
    file: 'auth/controllers/auth-whoami.controller.ts',
    prefix: 'auth',
  },
  ingredients: {
    file: 'collections/ingredients/controllers/ingredients-relationships.controller.ts',
    prefix: 'ingredients',
  },
  workflowCrud: {
    file: 'collections/workflows/controllers/workflow-crud.controller.ts',
    prefix: 'workflows',
  },
  workflowMarketplace: {
    file: 'collections/workflows/controllers/workflow-marketplace.controller.ts',
    prefix: 'workflows',
  },
  workflowExecution: {
    file: 'collections/workflows/controllers/workflow-execution.controller.ts',
    prefix: 'workflows',
  },
  workflowExecutions: {
    file: 'collections/workflow-executions/controllers/workflow-executions.controller.ts',
    prefix: 'workflow-executions',
  },
  socialInbox: {
    file: 'collections/social-inbox/controllers/social-inbox.controller.ts',
    prefix: 'messages',
  },
  clipProjects: {
    file: 'collections/clip-projects/clip-projects.controller.ts',
    prefix: 'clip-projects',
  },
  clipProjectGeneration: {
    file: 'collections/clip-projects/clip-project-generation.controller.ts',
    prefix: 'clip-projects',
  },
  clipProjectIngestion: {
    file: 'collections/clip-projects/clip-project-ingestion.controller.ts',
    prefix: 'clip-projects',
  },
  clipProjectHighlights: {
    file: 'collections/clip-projects/clip-project-highlights.controller.ts',
    prefix: 'clip-projects',
  },
  postGroups: {
    file: 'collections/post-groups/controllers/post-groups.controller.ts',
    prefix: 'post-groups',
  },
  schedules: {
    file: 'collections/schedules/controllers/schedules.controller.ts',
    prefix: 'schedules',
  },
  metaAds: {
    file: 'services/integrations/meta-ads/controllers/meta-ads.controller.ts',
    prefix: 'services/meta-ads',
  },
  googleAds: {
    file: 'services/integrations/google-ads/controllers/google-ads.controller.ts',
    prefix: 'services/google-ads',
  },
  adsGateway: {
    file: 'services/ads-gateway/ads-gateway.controller.ts',
    prefix: 'ads',
  },
  skillsPro: {
    file: 'skills-pro/controllers/skill-download.controller.ts',
    prefix: 'skills-pro',
  },
};

interface ContractRoute {
  /** HTTP method decorator: Get | Post | Patch | Put | Delete */
  method: 'Get' | 'Post' | 'Patch' | 'Put' | 'Delete';
  /** The method-decorator argument, '' for a bare decorator, or BASE_CRUD_LIST. */
  sub: string;
  /** Key into API_CONTROLLERS. */
  controller: keyof typeof API_CONTROLLERS;
  /** Surfaced MCP tools that depend on this route. */
  tools: string[];
}

/**
 * Every non-agent-executor MCP tool's client path ↔ the API route that mounts
 * it. Agent-executor tools (those in `AgentToolName`) all proxy through
 * `POST /agent-tools/:name/execute`; they are covered by the single agentTools
 * route below plus the coverage assertion.
 */
const ROUTE_CONTRACT: ContractRoute[] = [
  // ── Skills Pro organization entitlements ──
  {
    method: 'Post',
    sub: 'verify',
    controller: 'skillsPro',
    tools: ['verify_skills_pro_entitlement'],
  },
  {
    method: 'Post',
    sub: 'install',
    controller: 'skillsPro',
    tools: ['install_skills_pro_skill'],
  },

  // ── Agent executor (shared route for all AgentToolName tools) ──
  // `get_content_analytics` is a legacy-switch tool, not an `AgentToolName`, but
  // its article/image branch proxies to the agent executor — so it is named here
  // explicitly rather than being covered by the blanket agent-executor entry.
  {
    method: 'Post',
    sub: ':name/execute',
    controller: 'agentTools',
    tools: ['get_content_analytics'],
  },

  // ── Agent chat ──
  {
    method: 'Post',
    sub: '',
    controller: 'agentThreads',
    tools: ['create_chat'],
  },
  {
    method: 'Post',
    sub: ':threadId/messages',
    controller: 'agentThreads',
    tools: ['send_chat_message'],
  },
  // ── Approvals (createApproval + resolve_approval) ──
  { method: 'Post', sub: '', controller: 'approvals', tools: [] },
  { method: 'Get', sub: ':id', controller: 'approvals', tools: [] },
  {
    method: 'Post',
    sub: ':id/resolve',
    controller: 'approvals',
    tools: ['resolve_approval'],
  },
  { method: 'Post', sub: ':id/result', controller: 'approvals', tools: [] },

  // ── Legacy media / content ──
  {
    method: 'Get',
    sub: ':videoId',
    controller: 'videos',
    tools: ['get_video_status'],
  },
  { method: 'Get', sub: '', controller: 'videos', tools: ['list_videos'] },
  { method: 'Get', sub: '', controller: 'images', tools: ['list_images'] },
  { method: 'Get', sub: '', controller: 'avatars', tools: ['list_avatars'] },
  { method: 'Get', sub: '', controller: 'musics', tools: ['list_music'] },
  {
    method: 'Post',
    sub: 'generations',
    controller: 'articleOperations',
    tools: ['create_article'],
  },
  {
    method: 'Get',
    sub: BASE_CRUD_LIST,
    controller: 'articles',
    tools: ['search_articles'],
  },
  { method: 'Get', sub: ':id', controller: 'articles', tools: ['get_article'] },
  {
    method: 'Get',
    sub: 'usage',
    controller: 'credits',
    tools: ['get_usage_stats'],
  },

  // ── Analytics → content-performance (video/content analytics) ──
  {
    method: 'Get',
    sub: '',
    controller: 'contentPerformance',
    tools: ['get_video_analytics', 'get_content_analytics'],
  },
  {
    method: 'Get',
    sub: 'aggregate/:generationId',
    controller: 'contentPerformance',
    tools: ['get_video_analytics', 'get_content_analytics'],
  },
  {
    method: 'Get',
    sub: ':id',
    controller: 'contentPerformance',
    tools: ['get_linkedin_analytics'],
  },

  // ── LinkedIn ──
  {
    method: 'Post',
    sub: '',
    controller: 'contentIntelGenerate',
    tools: ['generate_linkedin_content'],
  },
  {
    method: 'Get',
    sub: 'mentions',
    controller: 'credentialsPublishing',
    tools: ['get_linkedin_connection_status'],
  },

  // ── Account management ──
  {
    method: 'Get',
    sub: 'whoami',
    controller: 'authWhoami',
    tools: ['get_account_info'],
  },
  {
    method: 'Get',
    sub: '',
    controller: 'brands',
    tools: ['list_brands', 'get_brand'],
  },
  {
    method: 'Get',
    sub: ':ingredientId/metadata',
    controller: 'ingredients',
    tools: ['get_job_status'],
  },

  // ── Workflows (control + legacy) ──
  {
    method: 'Get',
    sub: ':workflowId',
    controller: 'workflowCrud',
    tools: ['inspect_workflow', 'get_workflow_status'],
  },
  {
    method: 'Post',
    sub: '',
    controller: 'workflowCrud',
    tools: ['duplicate_workflow'],
  },
  {
    method: 'Get',
    sub: 'templates',
    controller: 'workflowMarketplace',
    tools: ['list_workflow_templates'],
  },
  {
    method: 'Patch',
    sub: ':workflowId',
    controller: 'workflowCrud',
    tools: ['set_workflow_schedule'],
  },
  {
    method: 'Get',
    sub: '',
    controller: 'workflowExecutions',
    tools: ['list_workflow_runs'],
  },
  {
    method: 'Get',
    sub: ':id',
    controller: 'workflowExecutions',
    tools: ['get_workflow_run'],
  },

  // ── Social inbox ──
  {
    method: 'Get',
    sub: '',
    controller: 'socialInbox',
    tools: ['list_social_conversations'],
  },
  {
    method: 'Get',
    sub: ':conversationId',
    controller: 'socialInbox',
    tools: ['get_social_conversation'],
  },
  {
    method: 'Get',
    sub: ':conversationId/messages',
    controller: 'socialInbox',
    tools: ['get_social_conversation'],
  },
  {
    method: 'Post',
    sub: ':conversationId/drafts',
    controller: 'socialInbox',
    tools: ['create_social_reply_draft'],
  },
  {
    method: 'Patch',
    sub: ':conversationId/drafts/:messageId',
    controller: 'socialInbox',
    tools: ['approve_social_draft', 'reject_social_draft'],
  },
  {
    method: 'Post',
    sub: ':conversationId/replies',
    controller: 'socialInbox',
    tools: ['post_social_reply'],
  },
  {
    method: 'Post',
    sub: ':conversationId/dms',
    controller: 'socialInbox',
    tools: ['send_social_dm'],
  },
  {
    method: 'Patch',
    sub: ':conversationId',
    controller: 'socialInbox',
    tools: [
      'tag_social_conversation',
      'assign_social_conversation',
      'mark_social_conversation_resolved',
    ],
  },

  // ── Clip projects ──
  {
    method: 'Post',
    sub: 'analyze',
    controller: 'clipProjectIngestion',
    tools: ['analyze_clip_project'],
  },
  {
    method: 'Post',
    sub: 'from-youtube',
    controller: 'clipProjectIngestion',
    tools: ['create_clip_project_from_youtube'],
  },
  {
    method: 'Get',
    sub: ':projectId/highlights',
    controller: 'clipProjectHighlights',
    tools: ['get_clip_highlights'],
  },
  {
    method: 'Post',
    sub: ':projectId/generate',
    controller: 'clipProjectGeneration',
    tools: ['generate_clips'],
  },
  {
    method: 'Get',
    sub: ':id',
    controller: 'clipProjects',
    tools: ['get_clip_project'],
  },
  {
    method: 'Get',
    sub: '',
    controller: 'clipProjects',
    tools: ['list_clip_projects'],
  },

  // ── Scheduler releases ──
  {
    method: 'Post',
    sub: '',
    controller: 'postGroups',
    tools: ['create_scheduled_release'],
  },
  {
    method: 'Get',
    sub: ':id',
    controller: 'postGroups',
    tools: ['get_scheduled_release'],
  },
  // Field updates and lifecycle ({ action }) share PATCH :id.
  {
    method: 'Patch',
    sub: ':id',
    controller: 'postGroups',
    tools: ['update_scheduled_release', 'control_scheduled_release'],
  },
  {
    method: 'Patch',
    sub: ':id/targets/:targetId',
    controller: 'postGroups',
    tools: ['update_scheduled_release'],
  },
  {
    method: 'Get',
    sub: 'channel-capabilities',
    controller: 'schedules',
    tools: ['list_scheduler_capabilities'],
  },
  {
    method: 'Get',
    sub: 'brand/:brandId/publishing-readiness',
    controller: 'credentialsPublishing',
    tools: ['list_brand_publishing_readiness'],
  },
  {
    method: 'Get',
    sub: 'channel-capabilities/:platform',
    controller: 'schedules',
    tools: ['get_scheduler_capability'],
  },
  {
    method: 'Post',
    sub: 'channel-capabilities/validate',
    controller: 'schedules',
    tools: ['validate_scheduler_target'],
  },

  // ── Meta Ads (services/meta-ads) ──
  {
    method: 'Get',
    sub: 'accounts',
    controller: 'metaAds',
    tools: ['list_meta_ad_accounts'],
  },
  {
    method: 'Get',
    sub: 'campaigns',
    controller: 'metaAds',
    tools: ['list_meta_campaigns'],
  },
  {
    method: 'Get',
    sub: 'campaigns/compare',
    controller: 'metaAds',
    tools: ['compare_meta_campaigns'],
  },
  {
    method: 'Get',
    sub: 'campaigns/:id/insights',
    controller: 'metaAds',
    tools: ['get_meta_campaign_insights'],
  },
  {
    method: 'Get',
    sub: 'adsets/:id/insights',
    controller: 'metaAds',
    tools: ['get_meta_adset_insights'],
  },
  {
    method: 'Get',
    sub: 'ads/:id/insights',
    controller: 'metaAds',
    tools: ['get_meta_ad_insights'],
  },
  {
    method: 'Get',
    sub: 'creatives',
    controller: 'metaAds',
    tools: ['list_meta_ad_creatives'],
  },
  {
    method: 'Get',
    sub: 'top-performers',
    controller: 'metaAds',
    tools: ['get_meta_top_performers'],
  },

  // ── Google Ads (services/google-ads) ──
  {
    method: 'Get',
    sub: 'customers',
    controller: 'googleAds',
    tools: ['list_google_ads_customers'],
  },
  {
    method: 'Get',
    sub: 'campaigns',
    controller: 'googleAds',
    tools: ['list_google_ads_campaigns'],
  },
  {
    method: 'Get',
    sub: 'campaigns/:id/metrics',
    controller: 'googleAds',
    tools: ['get_google_ads_campaign_metrics'],
  },
  {
    method: 'Get',
    sub: 'ad-groups/:id/insights',
    controller: 'googleAds',
    tools: ['get_google_ads_adgroup_insights'],
  },
  {
    method: 'Get',
    sub: 'keywords',
    controller: 'googleAds',
    tools: ['get_google_ads_keyword_performance'],
  },
  {
    method: 'Get',
    sub: 'search-terms/:campaignId',
    controller: 'googleAds',
    tools: ['get_google_ads_search_terms'],
  },

  // ── TikTok Ads (platform-generic ads gateway, `/ads/:platform/*`) ──
  {
    method: 'Get',
    sub: ':platform/accounts',
    controller: 'adsGateway',
    tools: ['list_tiktok_ad_accounts'],
  },
  {
    method: 'Get',
    sub: ':platform/campaigns',
    controller: 'adsGateway',
    tools: ['list_tiktok_campaigns'],
  },
  {
    method: 'Get',
    sub: ':platform/campaigns/:campaignId/insights',
    controller: 'adsGateway',
    tools: ['get_tiktok_campaign_insights'],
  },
  {
    method: 'Get',
    sub: ':platform/top-performers',
    controller: 'adsGateway',
    tools: ['get_tiktok_top_performers'],
  },
  {
    method: 'Get',
    sub: ':platform/adsets',
    controller: 'adsGateway',
    tools: ['list_tiktok_adgroups'],
  },
  {
    method: 'Get',
    sub: ':platform/ads',
    controller: 'adsGateway',
    tools: ['list_tiktok_ads'],
  },

  // ── Ads gateway (platform-generic, backed by IAdsAdapter) ──
  {
    method: 'Get',
    sub: ':platform/adsets/:adSetId/insights',
    controller: 'adsGateway',
    tools: ['get_ads_adset_insights'],
  },
  {
    method: 'Get',
    sub: ':platform/ads/:adId/insights',
    controller: 'adsGateway',
    tools: ['get_ads_ad_insights'],
  },
];

const readController = (() => {
  const cache = new Map<string, string>();
  return (key: keyof typeof API_CONTROLLERS): string => {
    const { file } = API_CONTROLLERS[key];
    if (!cache.has(key)) {
      cache.set(key, readFileSync(path.join(apiSrc, file), 'utf8'));
    }
    return cache.get(key) as string;
  };
})();

const decoratorFor = (route: ContractRoute): string =>
  route.sub === '' ? `@${route.method}()` : `@${route.method}('${route.sub}')`;

const catalog = getToolsForSurface('mcp').map((tool) => tool.name);
const agentExecutorNames = new Set<string>(Object.values(AgentToolName));

describe('MCP → API route contract', () => {
  it('mounts every controller the MCP proxy depends on at its expected prefix', () => {
    const wrong: string[] = [];
    for (const [key, { prefix }] of Object.entries(API_CONTROLLERS)) {
      const src = readController(key as keyof typeof API_CONTROLLERS);
      if (!src.includes(`@Controller('${prefix}')`)) {
        wrong.push(`${key} → @Controller('${prefix}')`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('mounts a real route for every MCP client path', () => {
    const missing: string[] = [];
    for (const route of ROUTE_CONTRACT) {
      const src = readController(route.controller);
      const mounted =
        route.sub === BASE_CRUD_LIST
          ? src.includes('extends BaseCRUDController')
          : src.includes(decoratorFor(route));
      if (!mounted) {
        const shown =
          route.sub === BASE_CRUD_LIST
            ? `${route.controller} extends BaseCRUDController (inherited @Get())`
            : `${route.controller} ${decoratorFor(route)}`;
        missing.push(
          `${route.method.toUpperCase()} for [${route.tools.join(', ') || route.controller}] → ${shown}`,
        );
      }
    }
    expect(missing).toEqual([]);
  });

  it('covers every MCP-surfaced tool with a mounted route (no dead-wiring)', () => {
    const contractTools = new Set(ROUTE_CONTRACT.flatMap((r) => r.tools));
    const uncovered = catalog.filter(
      (name) =>
        !agentExecutorNames.has(name) &&
        !contractTools.has(name) &&
        name !== 'resolve_approval',
    );
    expect(uncovered).toEqual([]);
  });

  it('has no stale contract entries (every contract tool is still surfaced)', () => {
    const surfaced = new Set(catalog);
    const stale = [...new Set(ROUTE_CONTRACT.flatMap((r) => r.tools))].filter(
      (name) => !surfaced.has(name),
    );
    expect(stale).toEqual([]);
  });
});
