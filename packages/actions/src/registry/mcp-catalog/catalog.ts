import type { McpCatalogToolSpec } from '../../interfaces/mcp-catalog-call.interface';

/**
 * Every merged MCP tool. A merged tool takes `action` plus one `input` object
 * and runs the original tool named for that action; the original tools stay
 * the executors and are never listed. Retired names fail at once and name
 * their replacement.
 */
export const MCP_CATALOG_TOOLS = [
  {
    name: 'check_channel',
    description:
      "Check publishing channels. capabilities lists channels and limits when input is omitted; validate checks input.platform and returns errors/warnings/validationState; readiness lists a brand's connected channels and their health; connection_status and linkedin_connection report account connections. Read-only.",
    claudeActions: [
      'capabilities',
      'validate',
      'readiness',
      'linkedin_connection',
    ],
    operations: [
      {
        action: 'capabilities',
        executes: 'get_scheduler_capabilities',
        summary:
          'Channel capabilities: caption limits, media rules, publish modes, required settings, status. Pass platform for one channel; omit it to list all.',
      },
      { action: 'validate', executes: 'validate_scheduler_target' },
      { action: 'readiness', executes: 'get_brand_publishing_readiness' },
      { action: 'connection_status', executes: 'get_connection_status' },
      {
        action: 'linkedin_connection',
        executes: 'get_linkedin_connection_status',
      },
    ],
  },
  {
    name: 'upload_media',
    description:
      'Upload existing media for the selected brand. request reserves a pending asset and returns uploadUrl, assetId, method and constraints. PUT sends bytes with returned headers; POST_JSON sends localUpload with base64 bytes in localUpload.source.data. Then complete finalizes the upload and returns assetId and any hosted URL. Does not publish or attach media.',
    operations: [
      { action: 'request', executes: 'request_media_upload' },
      { action: 'complete', executes: 'complete_media_upload' },
    ],
  },
  {
    name: 'get_insights',
    description:
      'Read performance: overview analytics, content and video analytics, LinkedIn analytics, performance analysis and trending topics. Read-only.',
    claudeActions: [
      'overview',
      'content',
      'video',
      'linkedin',
      'performance',
      'trends',
    ],
    operations: [
      { action: 'overview', executes: 'get_analytics' },
      { action: 'content', executes: 'get_content_analytics' },
      { action: 'video', executes: 'get_video_analytics' },
      { action: 'linkedin', executes: 'get_linkedin_analytics' },
      { action: 'performance', executes: 'analyze_performance' },
      { action: 'trends', executes: 'get_trends' },
    ],
  },
  {
    name: 'get_content',
    description:
      'Read posts, scheduled releases, articles and article previews. Read-only.',
    claudeActions: ['posts', 'release', 'articles', 'article_preview'],
    operations: [
      {
        action: 'posts',
        executes: 'get_posts',
        summary:
          'Read posts: postId for one post; days for the upcoming calendar (paged, with gapDays); otherwise recent posts filtered by executionState, brandId and limit.',
      },
      { action: 'release', executes: 'get_scheduled_release' },
      {
        action: 'articles',
        executes: 'get_articles',
        summary:
          'Read one article by articleId or search published articles by query, optionally by category; pass exactly one of articleId or query.',
      },
      {
        action: 'article_preview',
        executes: 'get_article_preview',
        summary:
          'Get an expiring signed preview URL for an owned article; treat it as a bearer credential and never send it to analytics or logs.',
      },
    ],
  },
  {
    name: 'check_job',
    description:
      'Check an asynchronous job or project until it finishes: media jobs, 3D renders, coded visual projects, workflow runs. Read-only.',
    operations: [
      { action: 'job', executes: 'get_job_status' },
      { action: 'model3d', executes: 'get_model3d' },
      { action: 'visual_code_project', executes: 'get_visual_code_project' },
      { action: 'workflow_run', executes: 'get_workflow_run' },
      { action: 'workflow_status', executes: 'get_workflow_status' },
    ],
  },
  {
    name: 'get_generation_catalog',
    description:
      'Read what generation can do: models and prices, presets, storyboard capabilities, the coded visual catalog and a coded visual quote. Read-only; call before generate_media.',
    operations: [
      {
        action: 'options',
        executes: 'get_generation_options',
        summary:
          'Model catalog and enhancement settings: image/video/music keys are the model of a generation and image-edit keys the model of an edit (voice uses voiceId). With type, adds a Studio credit estimate and the organization balance; never charges or authorizes generation. Credits null = unpriced; balance null = unreadable wallet, 0 = empty. With type voice, lists saved voices.',
      },
      { action: 'presets', executes: 'get_presets' },
      {
        action: 'preset',
        executes: 'get_preset',
        summary:
          'Read one preset by key; pass slots on a cinematic short to get the compiled prompt, shot plan, negative prompt and sound spec, then use the compiled prompt to generate.',
      },
      {
        action: 'storyboard_capabilities',
        executes: 'storyboard_run_capabilities',
      },
      { action: 'visual_code_catalog', executes: 'get_visual_code_catalog' },
      {
        action: 'visual_code_quote',
        executes: 'quote_visual_code_generation',
        summary:
          'Quote a visual-code request without spending credits; show the model, inspection uncertainty, formats and maximum credits before requesting approval.',
      },
    ],
  },
  {
    name: 'get_knowledge',
    description:
      'Read the knowledge base: search it, list sources, read a source, or check context coverage. Read-only.',
    operations: [
      {
        action: 'search',
        executes: 'search_knowledge',
        summary:
          'Search the brand Knowledge library and return cited passages; exact names and quoted phrases match verbatim, nextCursor pages. Use it before writing anything that must be accurate about the brand.',
      },
      { action: 'sources', executes: 'get_knowledge_sources' },
      { action: 'read', executes: 'read_knowledge_source' },
      {
        action: 'coverage',
        executes: 'get_context_coverage',
        summary:
          'Report whether the context behind an answer is complete, per source family. Call it when a search returns nothing or before claiming something does not exist.',
      },
    ],
  },
  {
    name: 'find_workflows',
    description:
      'Read workflows: list them, templates, the system catalog, runs, or inspect one (the status of a run is read with check_job). Read-only.',
    operations: [
      { action: 'list', executes: 'get_workflows' },
      { action: 'templates', executes: 'get_workflow_templates' },
      { action: 'catalog', executes: 'get_system_workflow_catalog' },
      { action: 'runs', executes: 'get_workflow_runs' },
      { action: 'inspect', executes: 'inspect_workflow' },
    ],
  },
  {
    name: 'get_video_projects',
    description:
      'Read clip and editor projects: lists, one project, highlights and clip context. Read-only.',
    operations: [
      { action: 'clip_projects', executes: 'get_clipper_projects' },
      { action: 'clip_project', executes: 'get_clipper_project' },
      { action: 'highlights', executes: 'get_clipper_highlights' },
      {
        action: 'clip_context',
        executes: 'get_clip_context',
        summary:
          "Read a clip before editing it: pass clipperResultId for the clip and the transcript lines around it, or projectId to list that project's clips (exactly one).",
      },
      { action: 'editor_projects', executes: 'get_editor_projects' },
      { action: 'editor_project', executes: 'get_editor_project' },
    ],
  },
  {
    name: 'get_ads',
    description:
      'Read ad accounts, campaigns, ad groups, creatives, insights and top performers for Meta, Google and TikTok, and public ad research. Read-only.',
    operations: [
      { action: 'ads_ad_insights', executes: 'get_ads_ad_insights' },
      { action: 'ads_adset_insights', executes: 'get_ads_adset_insights' },
      { action: 'meta_accounts', executes: 'get_meta_ad_accounts' },
      { action: 'meta_campaigns', executes: 'get_meta_campaigns' },
      { action: 'meta_creatives', executes: 'get_meta_ad_creatives' },
      { action: 'meta_ad_insights', executes: 'get_meta_ad_insights' },
      { action: 'meta_adset_insights', executes: 'get_meta_adset_insights' },
      {
        action: 'meta_campaign_insights',
        executes: 'get_meta_campaign_insights',
      },
      { action: 'meta_compare_campaigns', executes: 'compare_meta_campaigns' },
      { action: 'meta_top_performers', executes: 'get_meta_top_performers' },
      { action: 'google_customers', executes: 'get_google_ads_customers' },
      { action: 'google_campaigns', executes: 'get_google_ads_campaigns' },
      {
        action: 'google_adgroup_insights',
        executes: 'get_google_ads_adgroup_insights',
      },
      {
        action: 'google_campaign_metrics',
        executes: 'get_google_ads_campaign_metrics',
      },
      {
        action: 'google_keywords',
        executes: 'get_google_ads_keyword_performance',
      },
      {
        action: 'google_search_terms',
        executes: 'get_google_ads_search_terms',
      },
      { action: 'tiktok_accounts', executes: 'get_tiktok_ad_accounts' },
      { action: 'tiktok_campaigns', executes: 'get_tiktok_campaigns' },
      { action: 'tiktok_adgroups', executes: 'get_tiktok_adgroups' },
      { action: 'tiktok_ads', executes: 'get_tiktok_ads' },
      {
        action: 'tiktok_campaign_insights',
        executes: 'get_tiktok_campaign_insights',
      },
      {
        action: 'tiktok_top_performers',
        executes: 'get_tiktok_top_performers',
      },
      { action: 'research', executes: 'get_ads_research' },
      { action: 'research_detail', executes: 'get_ad_research_detail' },
    ],
  },
  {
    name: 'get_workspace',
    description:
      'Read what needs attention: tasks, activity, the inbox, the review queue, stalled items, a prep brief and social conversations. Read-only.',
    operations: [
      { action: 'tasks', executes: 'get_tasks' },
      { action: 'task', executes: 'get_task' },
      { action: 'activity', executes: 'get_activity' },
      {
        action: 'inbox',
        executes: 'get_inbox',
        summary:
          'List what waits for review in the workspace inbox: workflow review gates and queued MCP approvals. Read-only; decisions are made in the app.',
      },
      {
        action: 'review_queue',
        executes: 'get_review_queue',
        summary:
          'List content waiting for review (matches Publishing Approvals for the brand, including workflow gates and MCP approvals); decisions need a person in Genfeed.',
      },
      { action: 'stalled', executes: 'get_stalled_items' },
      { action: 'prep_brief', executes: 'build_prep_brief' },
      { action: 'conversations', executes: 'get_social_conversations' },
      { action: 'conversation', executes: 'get_social_conversation' },
    ],
  },
  {
    name: 'get_context',
    description:
      'Read the account and its brands: profile, credits, usage, organizations, brand context, completeness and scan status. Read-only. Start with action account, then brands.',
    claudeActions: [
      'account',
      'brands',
      'brand_context',
      'brand_completeness',
      'brand_scan_status',
    ],
    operations: [
      {
        action: 'account',
        executes: 'get_account',
        summary:
          'Read profile (user, organization, scoped brand, role, isOnboardingCompleted), credits balance and usage; include selects sections.',
      },
      {
        action: 'brands',
        executes: 'get_brands',
        summary:
          'Read organization brands with name, description and tone. With several brands pass the chosen id as brandId to other tools; never implicitly use the first.',
      },
      {
        action: 'organizations',
        executes: 'get_orgs',
        summary:
          'List member organizations, the active one and brands; with all-organizations consent any tool takes an optional organization.',
      },
      {
        action: 'brand_context',
        executes: 'get_brand_context',
        summary:
          'Read brand identity, guidelines, visual kit, voice, strategy, Knowledge and recent posts. Pass contentType and/or platform to also get the writing rules; read them before writing copy yourself.',
      },
      { action: 'brand_completeness', executes: 'get_brand_completeness' },
      { action: 'brand_scan_status', executes: 'get_brand_scan_status' },
    ],
  },
  {
    name: 'save_post',
    description:
      'Save content for review. Never publishes or schedules. post saves a reviewable draft from text or media; article imports reviewed HTML unchanged as an unpublished article draft in the chosen brand; article_update edits an existing article (label, slug, summary, HTML content with inline images, cover image) without publishing; campaign manages native content campaigns; track_link tracks an already published X or YouTube post by URL.',
    claudeActions: ['post', 'article', 'article_update'],
    operations: [
      { action: 'post', executes: 'create_post' },
      { action: 'article', executes: 'create_article_draft' },
      { action: 'article_update', executes: 'update_article_draft' },
      { action: 'campaign', executes: 'manage_campaign' },
      { action: 'track_link', executes: 'track_post_link' },
    ],
  },
  {
    name: 'schedule_release',
    description:
      'Create or update a multi-channel release from prepared text and media. Run check_channel(action=validate) for each channel first. create saves a draft by default; a scheduled status or date requests future or recurring publishing. update changes content, media, recurrence, timing or one target. Every call needs server approval; review and apply it in Genfeed.',
    claudeActions: ['create', 'update'],
    operations: [
      { action: 'create', executes: 'create_scheduled_release' },
      { action: 'update', executes: 'update_scheduled_release' },
    ],
  },
  {
    name: 'control_release',
    description:
      'Control a release. control requests cancel, pause, resume or publish-now of a scheduled release; publish publishes an owned, reviewed article publicly. Review first with get_content, and check_channel(action=validate) before publish-now. Every call needs server-enforced approval.',
    claudeActions: ['control', 'publish'],
    operations: [
      { action: 'control', executes: 'control_scheduled_release' },
      { action: 'publish', executes: 'publish_article' },
    ],
  },
  {
    name: 'manage_knowledge',
    description:
      "Change a brand's Knowledge. capture saves a page, document, feed, media or text and ingests it; assign_purpose changes a source's purpose (Brand Truth, Inspiration, Research) or hides it from retrieval; archive removes a source from retrieval for good; retry requeues a failed ingestion.",
    operations: [
      { action: 'capture', executes: 'capture_knowledge' },
      { action: 'assign_purpose', executes: 'assign_knowledge_purpose' },
      { action: 'archive', executes: 'archive_knowledge_source' },
      { action: 'retry', executes: 'retry_knowledge_ingestion' },
    ],
  },
  {
    name: 'manage_social',
    description:
      'Work the social inbox. draft_reply saves a reply or DM draft without sending; approve_draft and reject_draft decide a draft; reply and dm publish externally and need approval; assign, tag and resolve organize a conversation.',
    operations: [
      { action: 'draft_reply', executes: 'create_social_reply_draft' },
      { action: 'approve_draft', executes: 'approve_social_draft' },
      { action: 'reject_draft', executes: 'reject_social_draft' },
      { action: 'reply', executes: 'post_social_reply' },
      { action: 'dm', executes: 'send_social_dm' },
      { action: 'assign', executes: 'assign_social_conversation' },
      { action: 'tag', executes: 'tag_social_conversation' },
      { action: 'resolve', executes: 'mark_social_conversation_resolved' },
    ],
  },
  {
    name: 'manage_skill',
    description:
      'Manage skills. create, fork, publish, rollback and archive change a skill; export reads its instructions when allowed; verify_pro checks a Skills Pro receipt and lists the skills it grants; install_pro installs one entitled pack after approval.',
    operations: [
      { action: 'create', executes: 'create_skill' },
      { action: 'fork', executes: 'fork_skill' },
      { action: 'publish', executes: 'publish_skill' },
      { action: 'rollback', executes: 'rollback_skill' },
      { action: 'archive', executes: 'archive_skill' },
      { action: 'export', executes: 'export_skill' },
      { action: 'verify_pro', executes: 'verify_skills_pro_entitlement' },
      { action: 'install_pro', executes: 'install_skills_pro_skill' },
    ],
  },
  {
    name: 'manage_workflow',
    description:
      'Change workflows. create saves one; duplicate copies one without touching the source; install adds a system workflow to the workspace; schedule turns its schedule on or off; execute runs it and spends credits, so inspect it first with find_workflows; create_ad_remix and create_instagram_remix build a remix workflow from a source ad or Instagram post.',
    operations: [
      { action: 'create', executes: 'create_workflow' },
      { action: 'duplicate', executes: 'duplicate_workflow' },
      { action: 'install', executes: 'install_system_workflow' },
      { action: 'schedule', executes: 'set_workflow_schedule' },
      { action: 'execute', executes: 'execute_workflow' },
      { action: 'create_ad_remix', executes: 'create_ad_remix_workflow' },
      {
        action: 'create_instagram_remix',
        executes: 'create_instagram_remix_workflow',
      },
    ],
  },
  {
    name: 'manage_workspace',
    description:
      'Work in the workspace. new_task records a task and task updates, comments on or completes one; neither starts work. new_chat and chat_message talk to the agent; switch_organization changes the active organization.',
    operations: [
      { action: 'new_task', executes: 'create_task' },
      { action: 'task', executes: 'manage_task' },
      { action: 'new_chat', executes: 'create_chat' },
      { action: 'chat_message', executes: 'send_chat_message' },
      { action: 'switch_organization', executes: 'switch_org' },
    ],
  },
] as const satisfies readonly McpCatalogToolSpec[];

export type McpCatalogToolName = (typeof MCP_CATALOG_TOOLS)[number]['name'];
