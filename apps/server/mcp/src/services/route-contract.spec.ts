import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentToolName } from '@genfeedai/interfaces';
import { getToolsForSurface } from '@genfeedai/tools';

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
  agentRuns: {
    file: 'collections/agent-runs/controllers/agent-runs.controller.ts',
    prefix: 'runs',
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
  credits: {
    file: 'collections/credits/controllers/credits.controller.ts',
    prefix: 'credits',
  },
  credentials: {
    file: 'collections/credentials/controllers/credentials.controller.ts',
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
  metaAds: {
    file: 'services/integrations/meta-ads/controllers/meta-ads.controller.ts',
    prefix: 'services/meta-ads',
  },
  googleAds: {
    file: 'services/integrations/google-ads/controllers/google-ads.controller.ts',
    prefix: 'services/google-ads',
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
  // ── Agent executor (shared route for all AgentToolName tools) ──
  { method: 'Post', sub: ':name/execute', controller: 'agentTools', tools: [] },

  // ── Agent chat + runs ──
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
    tools: ['send_chat_message', 'retry_agent_run'],
  },
  {
    method: 'Get',
    sub: '',
    controller: 'agentRuns',
    tools: ['list_agent_runs'],
  },
  {
    method: 'Get',
    sub: 'active',
    controller: 'agentRuns',
    tools: ['list_agent_runs'],
  },
  {
    method: 'Get',
    sub: ':id',
    controller: 'agentRuns',
    tools: ['get_agent_run', 'retry_agent_run'],
  },
  {
    method: 'Get',
    sub: ':id/content',
    controller: 'agentRuns',
    tools: ['get_agent_run_content'],
  },
  {
    method: 'Post',
    sub: ':id/cancellations',
    controller: 'agentRuns',
    tools: ['cancel_agent_run'],
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
  {
    method: 'Get',
    sub: BASE_CRUD_LIST,
    controller: 'musics',
    tools: ['list_music'],
  },
  {
    method: 'Post',
    sub: 'generations',
    controller: 'articles',
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
    controller: 'credentials',
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
    sub: ':workflowId/clone',
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
    controller: 'clipProjects',
    tools: ['analyze_clip_project'],
  },
  {
    method: 'Post',
    sub: 'from-youtube',
    controller: 'clipProjects',
    tools: ['create_clip_project_from_youtube'],
  },
  {
    method: 'Get',
    sub: ':projectId/highlights',
    controller: 'clipProjects',
    tools: ['get_clip_highlights'],
  },
  {
    method: 'Post',
    sub: ':projectId/generate',
    controller: 'clipProjects',
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
