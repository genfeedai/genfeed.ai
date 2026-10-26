import { describe, expect, it } from 'vitest';
import { toMcpTools } from '../../adapters/to-mcp-tool';
import type { CanonicalToolDefinition } from '../../interfaces/tool-definition.interface';
import {
  CURATED_ACTION_CATALOG,
  isPublishingApprovalRequired,
} from '../curated-action-catalog';
import { isMcpListedToolName } from '../mcp-catalog-calls';
import {
  isApprovalRequiredToolName,
  isReadOnlyToolName,
} from '../mutation-policy';
import { ALL_TOOLS, getToolByName, getToolsForSurface } from '../tool-registry';

import { deriveMcpToolPresentation } from './tool-annotations';

const READ_ONLY_PREFIXES = [
  'describe_',
  'get_',
  'list_',
  'search_',
  'validate_',
] as const;

const SCHEDULER_WRITES = [
  'control_scheduled_release',
  'create_scheduled_release',
  'update_scheduled_release',
] as const;

const AUDITED_PRESENTATIONS = [
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'enhance_prompt',
    title: 'Enhance Prompt',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'generate',
    title: 'Generate',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'get_x_posts',
    title: 'Get X Posts',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'list_x_account_activity',
    title: 'List X Account Activity',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      readOnlyHint: true,
    },
    name: 'get_ads_ad_insights',
    title: 'Get Ads Ad Insights',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      readOnlyHint: true,
    },
    name: 'get_ads_adset_insights',
    title: 'Get Ads Adset Insights',
  },
  {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    },
    name: 'cancel_visual_code_project',
    title: 'Cancel Visual Code Project',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'transform_media',
    title: 'Transform Media',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'create_post',
    title: 'Create Post',
  },
  {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'onboard_brand',
    title: 'Onboard Brand',
  },
  {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'execute_workflow',
    title: 'Execute Workflow',
  },
  {
    annotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'generate_turbo_content',
    title: 'Generate Turbo Content',
  },
] satisfies ReadonlyArray<
  Pick<CanonicalToolDefinition, 'name' | 'title' | 'annotations'>
>;

const AUDITED_READ_PRESENTATIONS = [
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'get_ad_research_detail',
    title: 'Get Ad Research Detail',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'get_articles',
    title: 'Get Articles',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    },
    name: 'get_connection_status',
    title: 'Get Connection Status',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'get_social_conversation',
    title: 'Get Social Conversation',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'list_ads_research',
    title: 'List Ads Research',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    name: 'list_social_conversations',
    title: 'List Social Conversations',
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    },
    name: 'list_workflows',
    title: 'List Workflows',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    name: 'get_account',
    title: 'Get Account',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    name: 'get_analytics',
    title: 'Get Analytics',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    name: 'get_brand_context',
    title: 'Get Brand Context',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    name: 'get_clipper_project',
    title: 'Get Clipper Project',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    name: 'get_content_analytics',
    title: 'Get Content Analytics',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    name: 'get_generation_options',
    title: 'Get Generation Options',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    name: 'get_instagram_inspiration_detail',
    title: 'Get Instagram Inspiration Detail',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    name: 'get_remix_run',
    title: 'Get Remix Run',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    name: 'list_instagram_inspiration',
    title: 'List Instagram Inspiration',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    name: 'search_knowledge',
    title: 'Search Knowledge',
  },
  {
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    name: 'verify_skills_pro_entitlement',
    title: 'Verify Skills Pro Entitlement',
  },
] satisfies ReadonlyArray<
  Pick<CanonicalToolDefinition, 'name' | 'title' | 'annotations'>
>;

const FROZEN_MCP_PRESENTATIONS = [
  [
    'analyze_clipper_project',
    'Analyze Clipper Project',
    false,
    true,
    false,
    false,
  ],
  ['analyze_performance', 'Analyze Performance', true, false, true, false],
  ['approve_social_draft', 'Approve Social Draft', false, true, false, true],
  [
    'archive_knowledge_source',
    'Archive Knowledge Source',
    false,
    true,
    false,
    false,
  ],
  ['archive_skill', 'Archive Skill', false, true, false, false],
  [
    'assign_knowledge_purpose',
    'Assign Knowledge Purpose',
    false,
    true,
    false,
    false,
  ],
  [
    'assign_social_conversation',
    'Assign Social Conversation',
    false,
    true,
    false,
    false,
  ],
  [
    'attach_remix_analysis_source',
    'Attach Remix Analysis Source',
    false,
    true,
    false,
    false,
  ],
  [
    'cancel_visual_code_project',
    'Cancel Visual Code Project',
    false,
    true,
    false,
    false,
  ],
  ['capture_knowledge', 'Capture Knowledge', false, true, false, false],
  [
    'compare_meta_campaigns',
    'Compare Meta Campaigns',
    true,
    false,
    true,
    false,
  ],
  [
    'complete_media_upload',
    'Complete Media Upload',
    false,
    false,
    false,
    false,
  ],
  [
    'connect_social_account',
    'Connect Social Account',
    false,
    true,
    false,
    false,
  ],
  [
    'control_remix_generation',
    'Control Remix Generation',
    false,
    true,
    false,
    true,
  ],
  [
    'control_scheduled_release',
    'Control Scheduled Release',
    false,
    true,
    false,
    true,
  ],
  [
    'create_ad_remix_workflow',
    'Create Ad Remix Workflow',
    false,
    true,
    false,
    false,
  ],
  ['create_article_draft', 'Create Article Draft', false, true, false, false],
  ['create_brand_from_url', 'Create Brand From Url', false, true, false, false],
  ['create_chat', 'Create Chat', false, true, false, false],
  [
    'create_clipper_project_from_youtube',
    'Create Clipper Project From Youtube',
    false,
    true,
    false,
    false,
  ],
  [
    'create_instagram_remix_workflow',
    'Create Instagram Remix Workflow',
    false,
    true,
    false,
    false,
  ],
  ['create_post', 'Create Post', false, false, false, true],
  ['create_remix_concept', 'Create Remix Concept', false, false, false, false],
  [
    'create_scheduled_release',
    'Create Scheduled Release',
    false,
    true,
    false,
    true,
  ],
  ['create_skill', 'Create Skill', false, true, false, false],
  [
    'create_social_reply_draft',
    'Create Social Reply Draft',
    false,
    true,
    false,
    false,
  ],
  [
    'create_storyboard_remix',
    'Create Storyboard Remix',
    false,
    false,
    false,
    false,
  ],
  ['create_workflow', 'Create Workflow', false, true, false, false],
  ['duplicate_workflow', 'Duplicate Workflow', false, true, false, false],
  ['enhance_prompt', 'Enhance Prompt', false, false, false, true],
  ['execute_workflow', 'Execute Workflow', false, true, false, true],
  ['export_skill', 'Export Skill', true, false, true, false],
  [
    'export_visual_code_project',
    'Export Visual Code Project',
    false,
    true,
    false,
    false,
  ],
  ['find_tools', 'Find Tools', true, false, true, false],
  ['fork_skill', 'Fork Skill', false, true, false, false],
  ['generate', 'Generate', false, false, false, true],
  ['run_clipper', 'Run Clipper', false, true, false, true],
  ['generate_content', 'Generate Content', false, true, false, true],
  [
    'generate_turbo_content',
    'Generate Turbo Content',
    false,
    true,
    false,
    true,
  ],
  ['generate_visual_code', 'Generate Visual Code', false, true, false, true],
  ['get_account', 'Get Account', false, false, true, false],
  [
    'get_ad_research_detail',
    'Get Ad Research Detail',
    false,
    false,
    false,
    true,
  ],
  ['get_ads_ad_insights', 'Get Ads Ad Insights', true, false, true, true],
  ['get_ads_adset_insights', 'Get Ads Adset Insights', true, false, true, true],
  ['get_analytics', 'Get Analytics', false, false, false, false],
  ['get_article_preview', 'Get Article Preview', true, false, true, false],
  ['get_articles', 'Get Articles', false, false, false, true],
  [
    'get_brand_completeness',
    'Get Brand Completeness',
    true,
    false,
    true,
    false,
  ],
  ['get_brand_context', 'Get Brand Context', false, false, false, true],
  ['get_brand_scan_status', 'Get Brand Scan Status', true, false, true, false],
  ['get_brands', 'Get Brands', true, false, true, false],
  [
    'get_clipper_highlights',
    'Get Clipper Highlights',
    true,
    false,
    true,
    false,
  ],
  ['get_clipper_project', 'Get Clipper Project', false, true, true, true],
  [
    'get_connection_status',
    'Get Connection Status',
    false,
    false,
    false,
    false,
  ],
  [
    'get_content_analytics',
    'Get Content Analytics',
    false,
    false,
    false,
    false,
  ],
  [
    'get_generation_options',
    'Get Generation Options',
    false,
    true,
    true,
    false,
  ],
  [
    'get_google_ads_adgroup_insights',
    'Get Google Ads Adgroup Insights',
    true,
    false,
    true,
    false,
  ],
  [
    'get_google_ads_campaign_metrics',
    'Get Google Ads Campaign Metrics',
    true,
    false,
    true,
    false,
  ],
  [
    'get_google_ads_keyword_performance',
    'Get Google Ads Keyword Performance',
    true,
    false,
    true,
    false,
  ],
  [
    'get_google_ads_search_terms',
    'Get Google Ads Search Terms',
    true,
    false,
    true,
    false,
  ],
  [
    'get_instagram_inspiration_detail',
    'Get Instagram Inspiration Detail',
    false,
    false,
    false,
    true,
  ],
  ['get_job_status', 'Get Job Status', true, false, true, false],
  [
    'get_linkedin_analytics',
    'Get Linkedin Analytics',
    true,
    false,
    true,
    false,
  ],
  [
    'get_linkedin_connection_status',
    'Get Linkedin Connection Status',
    true,
    false,
    true,
    false,
  ],
  ['get_meta_ad_insights', 'Get Meta Ad Insights', true, false, true, false],
  [
    'get_meta_adset_insights',
    'Get Meta Adset Insights',
    true,
    false,
    true,
    false,
  ],
  [
    'get_meta_campaign_insights',
    'Get Meta Campaign Insights',
    true,
    false,
    true,
    false,
  ],
  [
    'get_meta_top_performers',
    'Get Meta Top Performers',
    true,
    false,
    true,
    false,
  ],
  ['get_posts', 'Get Posts', true, false, true, false],
  ['get_remix_run', 'Get Remix Run', false, true, true, false],
  ['get_scheduled_release', 'Get Scheduled Release', true, false, true, false],
  [
    'get_scheduler_capabilities',
    'Get Scheduler Capabilities',
    true,
    false,
    true,
    false,
  ],
  [
    'get_social_conversation',
    'Get Social Conversation',
    false,
    false,
    false,
    true,
  ],
  [
    'get_tiktok_campaign_insights',
    'Get Tiktok Campaign Insights',
    true,
    false,
    true,
    false,
  ],
  [
    'get_tiktok_top_performers',
    'Get Tiktok Top Performers',
    true,
    false,
    true,
    false,
  ],
  ['get_trends', 'Get Trends', true, false, true, false],
  ['get_video_analytics', 'Get Video Analytics', true, false, true, false],
  [
    'get_visual_code_catalog',
    'Get Visual Code Catalog',
    true,
    false,
    true,
    false,
  ],
  [
    'get_visual_code_project',
    'Get Visual Code Project',
    true,
    false,
    true,
    false,
  ],
  ['get_workflow_run', 'Get Workflow Run', true, false, true, false],
  ['get_workflow_status', 'Get Workflow Status', true, false, true, false],
  ['get_x_posts', 'Get X Posts', false, false, false, true],
  ['import_source_post', 'Import Source Post', false, false, false, true],
  [
    'initiate_oauth_connect',
    'Initiate Oauth Connect',
    false,
    true,
    false,
    false,
  ],
  ['inspect_workflow', 'Inspect Workflow', true, false, true, false],
  [
    'install_skills_pro_skill',
    'Install Skills Pro Skill',
    false,
    true,
    false,
    false,
  ],
  [
    'install_system_workflow',
    'Install System Workflow',
    false,
    true,
    false,
    false,
  ],
  ['list_ads_research', 'List Ads Research', false, false, false, true],
  ['list_assets', 'List Assets', true, false, true, false],
  [
    'list_brand_publishing_readiness',
    'List Brand Publishing Readiness',
    true,
    false,
    true,
    false,
  ],
  ['list_clipper_projects', 'List Clipper Projects', true, false, true, false],
  [
    'list_google_ads_campaigns',
    'List Google Ads Campaigns',
    true,
    false,
    true,
    false,
  ],
  [
    'list_google_ads_customers',
    'List Google Ads Customers',
    true,
    false,
    true,
    false,
  ],
  [
    'list_instagram_inspiration',
    'List Instagram Inspiration',
    false,
    false,
    false,
    true,
  ],
  [
    'list_knowledge_sources',
    'List Knowledge Sources',
    true,
    false,
    true,
    false,
  ],
  ['list_meta_ad_accounts', 'List Meta Ad Accounts', true, false, true, false],
  [
    'list_meta_ad_creatives',
    'List Meta Ad Creatives',
    true,
    false,
    true,
    false,
  ],
  ['list_meta_campaigns', 'List Meta Campaigns', true, false, true, false],
  ['list_orgs', 'List Orgs', true, false, true, false],
  [
    'list_social_conversations',
    'List Social Conversations',
    false,
    false,
    false,
    true,
  ],
  [
    'list_system_workflow_catalog',
    'List System Workflow Catalog',
    true,
    false,
    true,
    false,
  ],
  [
    'list_tiktok_ad_accounts',
    'List Tiktok Ad Accounts',
    true,
    false,
    true,
    false,
  ],
  ['list_tiktok_adgroups', 'List Tiktok Adgroups', true, false, true, false],
  ['list_tiktok_ads', 'List Tiktok Ads', true, false, true, false],
  ['list_tiktok_campaigns', 'List Tiktok Campaigns', true, false, true, false],
  ['list_workflow_runs', 'List Workflow Runs', true, false, true, false],
  [
    'list_workflow_templates',
    'List Workflow Templates',
    true,
    false,
    true,
    false,
  ],
  ['list_workflows', 'List Workflows', false, false, false, false],
  [
    'list_x_account_activity',
    'List X Account Activity',
    false,
    false,
    false,
    true,
  ],
  [
    'mark_social_conversation_resolved',
    'Mark Social Conversation Resolved',
    false,
    true,
    false,
    false,
  ],
  ['onboard_brand', 'Onboard Brand', false, true, false, true],
  ['open_in_editor', 'Open In Editor', false, false, false, false],
  ['post_social_reply', 'Post Social Reply', false, true, false, true],
  ['publish_article', 'Publish Article', false, true, false, false],
  ['publish_skill', 'Publish Skill', false, true, false, false],
  [
    'quote_remix_generation',
    'Quote Remix Generation',
    false,
    true,
    false,
    false,
  ],
  [
    'quote_visual_code_generation',
    'Quote Visual Code Generation',
    true,
    false,
    true,
    false,
  ],
  ['read_knowledge_source', 'Read Knowledge Source', true, false, true, false],
  ['reject_social_draft', 'Reject Social Draft', false, true, false, false],
  [
    'replace_storyboard_character',
    'Replace Storyboard Character',
    false,
    true,
    false,
    true,
  ],
  ['repurpose_post', 'Repurpose Post', false, true, false, false],
  ['request_media_upload', 'Request Media Upload', false, false, false, false],
  ['resolve_approval', 'Resolve Approval', false, true, false, false],
  [
    'retry_knowledge_ingestion',
    'Retry Knowledge Ingestion',
    false,
    true,
    false,
    false,
  ],
  [
    'retry_visual_code_project',
    'Retry Visual Code Project',
    false,
    true,
    false,
    false,
  ],
  [
    'revise_visual_code_project',
    'Revise Visual Code Project',
    false,
    true,
    false,
    false,
  ],
  ['rollback_skill', 'Rollback Skill', false, true, false, false],
  ['search_knowledge', 'Search Knowledge', false, false, false, true],
  ['send_chat_message', 'Send Chat Message', false, true, false, false],
  ['send_social_dm', 'Send Social Dm', false, true, false, true],
  [
    'set_generation_settings',
    'Set Generation Settings',
    false,
    true,
    false,
    false,
  ],
  ['set_workflow_schedule', 'Set Workflow Schedule', false, true, false, false],
  [
    'skip_brand_interview_question',
    'Skip Brand Interview Question',
    false,
    true,
    false,
    false,
  ],
  ['start_brand_interview', 'Start Brand Interview', false, true, false, false],
  [
    'start_remix_generation',
    'Start Remix Generation',
    false,
    true,
    false,
    true,
  ],
  [
    'start_storyboard_long_form',
    'Start Storyboard Long Form',
    false,
    true,
    false,
    true,
  ],
  ['storyboard_long_form', 'Storyboard Long Form', false, true, false, false],
  [
    'storyboard_run_capabilities',
    'Storyboard Run Capabilities',
    true,
    false,
    true,
    false,
  ],
  [
    'submit_brand_interview_answer',
    'Submit Brand Interview Answer',
    false,
    true,
    false,
    false,
  ],
  ['switch_org', 'Switch Org', false, true, false, false],
  [
    'tag_social_conversation',
    'Tag Social Conversation',
    false,
    true,
    false,
    false,
  ],
  ['track_post_link', 'Track Post Link', false, true, false, false],
  ['transform_media', 'Transform Media', false, false, false, true],
  ['update_remix_concept', 'Update Remix Concept', false, true, false, false],
  [
    'update_scheduled_release',
    'Update Scheduled Release',
    false,
    true,
    false,
    true,
  ],
  [
    'validate_scheduler_target',
    'Validate Scheduler Target',
    true,
    false,
    true,
    false,
  ],
  [
    'verify_skills_pro_entitlement',
    'Verify Skills Pro Entitlement',
    false,
    false,
    true,
    false,
  ],
] as const;

describe('MCP tool annotations', () => {
  it.each(AUDITED_READ_PRESENTATIONS)(
    'emits audited read presentation for $name',
    ({ name, title, annotations }) => {
      const canonical = getToolByName(name);
      expect(canonical, name).toBeDefined();
      expect(canonical?.title, name).toBe(title);
      expect(canonical?.annotations, name).toEqual(annotations);
      const first = deriveMcpToolPresentation(name, canonical?.mutationPolicy);
      const second = deriveMcpToolPresentation(name, canonical?.mutationPolicy);
      expect(first.annotations, name).toEqual(annotations);
      expect(first.annotations).not.toBe(second.annotations);
      first.annotations.readOnlyHint = !annotations.readOnlyHint;
      expect(second.annotations, name).toEqual(annotations);
      const [listed] = toMcpTools(canonical ? [canonical] : []);
      expect(listed?.title, name).toBe(title);
      expect(listed?.annotations, name).toEqual(annotations);
    },
  );

  it('preserves the frozen complete MCP presentation catalog', () => {
    const rows = toMcpTools(getToolsForSurface('mcp'))
      .map(({ name, title, annotations }) => [
        name,
        title,
        annotations.readOnlyHint,
        annotations.destructiveHint,
        annotations.idempotentHint,
        annotations.openWorldHint,
      ])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    const expected = [
      ...FROZEN_MCP_PRESENTATIONS.filter((row) =>
        isMcpListedToolName(String(row[0])),
      ),
      ['check_channel', 'Check Channel', true, false, true, false],
      ['manage_campaign', 'Manage Campaign', false, true, false, false],
      ['upload_media', 'Upload Media', false, false, false, false],
    ].sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    for (const row of FROZEN_MCP_PRESENTATIONS.filter(
      (entry) => !isMcpListedToolName(String(entry[0])),
    )) {
      const tool = getToolByName(String(row[0]));
      expect([
        tool?.name,
        tool?.title,
        tool?.annotations?.readOnlyHint,
        tool?.annotations?.destructiveHint,
        tool?.annotations?.idempotentHint,
        tool?.annotations?.openWorldHint,
      ]).toEqual(row);
    }
    expect(rows).toHaveLength(146);
    expect(rows.map((row) => row[0])).toEqual(expected.map((row) => row[0]));
    expect(rows).toEqual(expected);
  });

  it('isolates every derived annotations object from stored overrides and other calls', () => {
    const first = deriveMcpToolPresentation('get_account', undefined);
    const second = deriveMcpToolPresentation('get_account', undefined);
    expect(first.annotations).not.toBe(second.annotations);
    first.annotations.readOnlyHint = true;
    first.annotations.destructiveHint = true;
    first.annotations.idempotentHint = false;
    first.annotations.openWorldHint = true;
    expect(
      deriveMcpToolPresentation('get_account', undefined).annotations,
    ).toEqual({
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: false,
    });
    expect(second.annotations).toEqual({
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: false,
    });
    expect(
      deriveMcpToolPresentation('get_brands', undefined).annotations,
    ).toEqual({
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
    });
  });

  it.each(AUDITED_PRESENTATIONS)(
    'emits audited presentation for $name',
    ({ name, title, annotations }) => {
      const canonical = getToolByName(name);
      expect(canonical, name).toBeDefined();
      expect(canonical?.title, name).toBe(title);
      expect(canonical?.annotations, name).toEqual(annotations);
      const [listed] = toMcpTools(canonical ? [canonical] : []);
      expect(listed?.title, name).toBe(title);
      expect(listed?.annotations, name).toEqual(annotations);
    },
  );

  it('puts a title and all four hints on every MCP-surfaced tool', () => {
    const mcpTools = getToolsForSurface('mcp');
    expect(mcpTools.length).toBeGreaterThan(0);

    for (const tool of mcpTools) {
      expect(tool.title, tool.name).toEqual(expect.any(String));
      expect(tool.title?.length, tool.name).toBeGreaterThan(0);
      expect(tool.annotations?.readOnlyHint, tool.name).toEqual(
        expect.any(Boolean),
      );
      expect(tool.annotations?.destructiveHint, tool.name).toEqual(
        expect.any(Boolean),
      );
      expect(tool.annotations?.idempotentHint, tool.name).toEqual(
        expect.any(Boolean),
      );
      expect(tool.annotations?.openWorldHint, tool.name).toEqual(
        expect.any(Boolean),
      );
    }

    for (const listed of toMcpTools(mcpTools)) {
      expect(listed.title, listed.name).toBe(getToolByName(listed.name)?.title);
      expect(listed.annotations, listed.name).toEqual(
        getToolByName(listed.name)?.annotations,
      );
    }
  });

  it('does not annotate agent-only tools', () => {
    const agentOnly = ALL_TOOLS.filter((tool) => !tool.surfaces.mcp);
    expect(agentOnly.length).toBeGreaterThan(0);
    for (const tool of agentOnly) {
      expect(tool.title, tool.name).toBeUndefined();
      expect(tool.annotations, tool.name).toBeUndefined();
    }
  });

  it('marks approval-required tools destructive and not read-only', () => {
    for (const tool of getToolsForSurface('mcp')) {
      if (!isApprovalRequiredToolName(tool.name)) continue;
      // Draft create and source import add records; they do not overwrite
      // or publish. transform_media is pinned in NON_DESTRUCTIVE_WRITE_NAMES.
      if (
        tool.name === 'create_post' ||
        tool.name === 'import_source_post' ||
        tool.name === 'get_x_posts' ||
        tool.name === 'list_x_account_activity' ||
        tool.name === 'transform_media'
      ) {
        continue;
      }
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(false);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(true);
      expect(tool.annotations?.idempotentHint, tool.name).toBe(false);
    }
  });

  it('marks prefixed reads read-only, idempotent, and not destructive', () => {
    for (const tool of getToolsForSurface('mcp')) {
      const matchesPrefix = READ_ONLY_PREFIXES.some((prefix) =>
        tool.name.startsWith(prefix),
      );
      if (
        !matchesPrefix ||
        AUDITED_READ_PRESENTATIONS.some(({ name }) => name === tool.name) ||
        isApprovalRequiredToolName(tool.name) ||
        !isReadOnlyToolName(tool.name)
      ) {
        continue;
      }
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      expect(tool.annotations?.idempotentHint, tool.name).toBe(true);
    }
  });

  it('keeps paid X reads off the read-only hint', () => {
    for (const name of ['get_x_posts', 'list_x_account_activity'] as const) {
      expect(getToolByName(name)?.annotations, name).toMatchObject({
        destructiveHint: false,
        readOnlyHint: false,
      });
    }
  });

  it('pins the reviewed exceptions', () => {
    expect(getToolByName('resolve_approval')?.annotations).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
    for (const name of SCHEDULER_WRITES) {
      expect(getToolByName(name)?.annotations?.destructiveHint, name).toBe(
        true,
      );
      expect(getToolByName(name)?.annotations?.readOnlyHint, name).toBe(false);
    }
    for (const name of [
      'get_brands',
      'list_assets',
      'validate_scheduler_target',
    ]) {
      expect(getToolByName(name)?.annotations?.readOnlyHint, name).toBe(true);
      expect(getToolByName(name)?.annotations?.destructiveHint, name).toBe(
        false,
      );
    }
  });

  it('marks generation and publishing tools open-world', () => {
    const publishing = new Set(
      CURATED_ACTION_CATALOG.filter((entry) =>
        isPublishingApprovalRequired(entry),
      ).map((entry) => entry.name),
    );

    for (const tool of getToolsForSurface('mcp')) {
      const isOpenWorld =
        tool.name === 'get_ad_research_detail' ||
        tool.name === 'get_articles' ||
        tool.name === 'get_social_conversation' ||
        tool.name === 'list_ads_research' ||
        tool.name === 'list_social_conversations' ||
        tool.name === 'get_brand_context' ||
        tool.name === 'get_clipper_project' ||
        tool.name === 'run_clipper' ||
        tool.name === 'get_instagram_inspiration_detail' ||
        tool.name === 'list_instagram_inspiration' ||
        tool.name === 'search_knowledge' ||
        tool.name === 'onboard_brand' ||
        tool.name === 'execute_workflow' ||
        tool.name === 'enhance_prompt' ||
        tool.name === 'get_x_posts' ||
        tool.name === 'list_x_account_activity' ||
        tool.name === 'get_ads_ad_insights' ||
        tool.name === 'get_ads_adset_insights' ||
        tool.name === 'generate' ||
        tool.name.startsWith('generate_') ||
        tool.name === 'transform_media' ||
        tool.name === 'import_source_post' ||
        tool.name === 'start_remix_generation' ||
        tool.name === 'control_remix_generation' ||
        tool.name === 'replace_storyboard_character' ||
        tool.name === 'start_storyboard_long_form' ||
        publishing.has(tool.name);
      expect(tool.annotations?.openWorldHint, tool.name).toBe(isOpenWorld);
    }
  });

  it('keeps media upload and get_posts hints off the global write default', () => {
    expect(getToolByName('request_media_upload')?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    });
    expect(getToolByName('get_posts')?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: true,
      readOnlyHint: true,
    });
    expect(getToolByName('complete_media_upload')?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    });
    expect(getToolByName('complete_media_upload')?.mutationPolicy).toBe(
      'direct',
    );
    expect(getToolByName('request_media_upload')?.mutationPolicy).toBe(
      'direct',
    );
    expect(getToolByName('get_posts')?.toolset).toBe('content');
    expect(getToolByName('request_media_upload')?.toolset).toBe('content');
    expect(getToolByName('complete_media_upload')?.toolset).toBe('content');
  });

  it('derives a title from the tool name', () => {
    expect(getToolByName('get_account')?.title).toBe('Get Account');
    expect(getToolByName('create_post')?.title).toBe('Create Post');
  });

  it('marks source import as a non-destructive external write', () => {
    const tool = getToolByName('import_source_post');
    expect(tool?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    });
    expect(tool?.mutationPolicy).toBe('approval-required');
  });

  it('marks Open in Editor as a non-destructive draft create', () => {
    const tool = getToolByName('open_in_editor');
    expect(tool?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    });
    expect(tool?.mutationPolicy).toBe('direct');
    expect(tool?.toolset).toBe('clipper');
    expect(tool?.creditCost).toBe(0);
  });

  it('marks MCP create_post as a non-destructive draft', () => {
    const tool = getToolByName('create_post');
    expect(tool?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    });
    expect(tool?.description).toContain('create_scheduled_release');
    expect(tool?.description).toContain('never publishes');
    expect(tool?.mutationPolicy).toBe('approval-required');
    expect(tool?.toolset).toBe('content');
  });
});
