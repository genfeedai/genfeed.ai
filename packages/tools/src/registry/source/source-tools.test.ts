import { readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_ONLY_TOOLS } from './agent-only/index.js';
import { BRAND_INTERVIEW_TOOLS } from './brand-interview.tools.js';
import { SOURCE_TOOLS } from './index.js';
import { MCP_ADMIN_TOOLS } from './mcp-only/admin.tools.js';
import { MCP_ONLY_TOOLS } from './mcp-only/index.js';
import { OVERLAP_TOOLS } from './overlap.tools.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_MODULE_LINES = 500;
const REQUIRED_ROLES = new Set(['user', 'admin', 'superadmin']);

/**
 * Canonical inventory of every tool name `SOURCE_TOOLS` must expose, frozen at
 * the #692 per-surface/per-category split. The split is move-only, so this
 * inventory guards against a tool being lost, duplicated, or accidentally
 * renamed when definitions are added or edited across the new modules. Sorted
 * ascending to make diffs obvious.
 */
const EXPECTED_TOOL_NAMES = [
  'ai_action',
  'analyze_performance',
  'batch_approve_reject',
  'benchmark_ad_performance',
  'cancel_agent_run',
  'capture_memory',
  'check_goal_progress',
  'check_onboarding_status',
  'compare_meta_campaigns',
  'complete_campaign',
  'complete_onboarding',
  'connect_social_account',
  'control_comfyui',
  'create_article',
  'create_avatar',
  'create_brand',
  'create_campaign',
  'create_chat',
  'create_goal',
  'create_livestream_bot',
  'create_post',
  'create_workflow',
  'delete_dataset',
  'discover_engagements',
  'draft_engagement_reply',
  'execute_workflow',
  'generate_ad_variations',
  'generate_as_identity',
  'generate_bootstrap',
  'generate_content',
  'generate_content_batch',
  'generate_darkroom_content',
  'generate_face_test',
  'generate_image',
  'generate_linkedin_content',
  'generate_monthly_content',
  'generate_music',
  'generate_onboarding_content',
  'generate_pulid',
  'generate_video',
  'generate_voice',
  'get_account_info',
  'get_ad_performance_insights',
  'get_agent_run',
  'get_agent_run_content',
  'get_analytics',
  'get_approval_summary',
  'get_article',
  'get_brand',
  'get_brand_completeness',
  'get_campaign_analytics',
  'get_connection_status',
  'get_content_analytics',
  'get_content_calendar',
  'get_credits_balance',
  'get_current_brand',
  'get_darkroom_health',
  'get_darkroom_job_status',
  'get_dataset_info',
  'get_google_ads_adgroup_insights',
  'get_google_ads_campaign_metrics',
  'get_google_ads_keyword_performance',
  'get_google_ads_search_terms',
  'get_job_status',
  'get_linkedin_analytics',
  'get_linkedin_connection_status',
  'get_meta_ad_insights',
  'get_meta_adset_insights',
  'get_meta_campaign_insights',
  'get_meta_top_performers',
  'get_top_ingredients',
  'get_training_status',
  'get_trends',
  'get_usage_stats',
  'get_video_analytics',
  'get_video_status',
  'get_workflow_status',
  'initiate_oauth_connect',
  'install_official_workflow',
  'list_agent_runs',
  'list_avatars',
  'list_brands',
  'list_genfeed_tools',
  'list_google_ads_campaigns',
  'list_google_ads_customers',
  'list_gpu_personas',
  'list_images',
  'list_loras',
  'list_meta_ad_accounts',
  'list_meta_ad_creatives',
  'list_meta_campaigns',
  'list_music',
  'list_posts',
  'list_review_queue',
  'list_videos',
  'list_workflow_templates',
  'list_workflows',
  'manage_livestream_bot',
  'open_studio_handoff',
  'pause_campaign',
  'prepare_clip_workflow_run',
  'prepare_generation',
  'prepare_voice_clone',
  'prepare_workflow_trigger',
  'present_payment_options',
  'rate_content',
  'rate_ingredient',
  'reframe_image',
  'render_dashboard',
  'replicate_top_ingredient',
  'request_asset',
  'resolve_approval',
  'resolve_handle',
  'retry_agent_run',
  'run_captioning',
  'schedule_post',
  'score_seo',
  'search_articles',
  'select_ingredient',
  'send_chat_message',
  'skip_brand_interview_question',
  'spawn_content_agent',
  'start_brand_interview',
  'start_campaign',
  'start_training',
  'submit_brand_interview_answer',
  'suggest_ad_headlines',
  'suggest_ingredient_alternatives',
  'update_goal',
  'update_strategy_state',
  'upscale_image',
] as const;

function listToolModuleFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...listToolModuleFiles(full));
    } else if (entry.name.endsWith('.tools.ts')) {
      out.push(full);
    }
  }
  return out;
}

function countLines(filePath: string): number {
  return readFileSync(filePath, 'utf8').replace(/\n$/, '').split('\n').length;
}

describe('SOURCE_TOOLS registry split (#692)', () => {
  it('exposes exactly 126 tool definitions', () => {
    expect(SOURCE_TOOLS).toHaveLength(EXPECTED_TOOL_NAMES.length);
  });

  it('has no duplicate tool names', () => {
    const names = SOURCE_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('matches the canonical tool-name inventory', () => {
    const names = SOURCE_TOOLS.map((tool) => tool.name).sort();
    expect(names).toEqual([...EXPECTED_TOOL_NAMES]);
  });

  it('concatenates overlap + agent-only + mcp-only + brand-interview in order', () => {
    expect(SOURCE_TOOLS).toEqual([
      ...OVERLAP_TOOLS,
      ...AGENT_ONLY_TOOLS,
      ...MCP_ONLY_TOOLS,
      ...BRAND_INTERVIEW_TOOLS,
    ]);
  });

  it('partitions tools by their declared surface', () => {
    expect(OVERLAP_TOOLS).toHaveLength(11);
    expect(AGENT_ONLY_TOOLS).toHaveLength(56);
    expect(MCP_ONLY_TOOLS).toHaveLength(60);
    expect(BRAND_INTERVIEW_TOOLS).toHaveLength(4);
    expect(
      OVERLAP_TOOLS.every((tool) => tool.surfaces.agent && tool.surfaces.mcp),
    ).toBe(true);
    expect(
      AGENT_ONLY_TOOLS.every(
        (tool) => tool.surfaces.agent && !tool.surfaces.mcp,
      ),
    ).toBe(true);
    expect(
      MCP_ONLY_TOOLS.every((tool) => !tool.surfaces.agent && tool.surfaces.mcp),
    ).toBe(true);
    expect(
      BRAND_INTERVIEW_TOOLS.every(
        (tool) => tool.surfaces.agent && tool.surfaces.mcp,
      ),
    ).toBe(true);
  });

  it('exposes a well-formed shape for every tool', () => {
    for (const tool of SOURCE_TOOLS) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.parameters.type).toBe('object');
      expect(typeof tool.parameters.properties).toBe('object');
      expect(typeof tool.creditCost).toBe('number');
      expect(REQUIRED_ROLES.has(tool.requiredRole)).toBe(true);
      expect(typeof tool.surfaces.agent).toBe('boolean');
      expect(typeof tool.surfaces.mcp).toBe('boolean');
    }
  });

  it('keeps MCP admin tools behind platform superadmin authorization', () => {
    expect(MCP_ADMIN_TOOLS.length).toBeGreaterThan(0);
    expect(
      MCP_ADMIN_TOOLS.every((tool) => tool.requiredRole === 'superadmin'),
    ).toBe(true);
  });

  it('keeps every data module within the line budget', () => {
    const files = listToolModuleFiles(HERE);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(countLines(file), file).toBeLessThanOrEqual(MAX_MODULE_LINES);
    }
  });
});
