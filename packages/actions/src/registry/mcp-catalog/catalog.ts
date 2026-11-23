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
      'Upload existing media for the selected brand. request reserves a pending asset and returns uploadUrl, assetId, method and constraints. PUT sends bytes with returned headers; POST_JSON sends localUpload with base64 bytes in localUpload.source.data. Then complete finalizes the upload and returns assetId and any hosted URL. Does not publish or attach media. To delete Library media use control_release(action=remove_asset).',
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
          'Read one article by articleId, or search published articles by query, optionally by category; pass exactly one of articleId or query. brandId goes with articleId only; category and limit with query only.',
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
          'List what waits for review in the workspace inbox: workflow review gates, queued MCP approvals and questions an agent run waits on. Read-only; decisions and answers are made in the app.',
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
          'List member organizations, the active one and brands; with all-organizations consent every other tool must name its organization.',
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
      'Create or update a multi-channel release from prepared text and media. Run check_channel(action=validate) for each channel first. create takes input={release:{...}} for one release or input={releases:[...]} for a batch, never the release fields at the top of input, and saves a draft by default; a scheduled status or date requests future or recurring publishing. update changes content, media, recurrence, timing or one target. Scheduling or changing a release never waits in the web approvals queue: the first call changes nothing and returns what to confirm; after the person agrees in this conversation, repeat it with confirmed true in the input. Drafts need no confirmation.',
    claudeActions: ['create', 'update'],
    operations: [
      { action: 'create', executes: 'create_scheduled_release' },
      { action: 'update', executes: 'update_scheduled_release' },
    ],
  },
  {
    name: 'control_release',
    description:
      'Control a release. control requests cancel, pause, resume or publish-now of a scheduled release; publish publishes an owned, reviewed article publicly; remove_post deletes a post from Genfeed, a published one included, and with deleteMedia the Library media only it uses (the social network copy is not touched); remove_asset deletes one Library asset by assetId from every post that uses it. Review first with get_content, and check_channel(action=validate) before publish-now. publish-now, resume, publish, remove_post and remove_asset change nothing on the first call: show the person what returns, and after they agree in this conversation repeat it with confirmed true in the input. cancel and pause need no confirmation. After a delete read back with get_content(action=posts) and get_assets.',
    claudeActions: ['control', 'publish'],
    operations: [
      { action: 'control', executes: 'control_scheduled_release' },
      { action: 'publish', executes: 'publish_article' },
      { action: 'remove_post', executes: 'delete_post' },
      { action: 'remove_asset', executes: 'delete_asset' },
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
    name: 'generate_text',
    description:
      'Write copy for a brand. content writes a post or article draft and saves it; turbo runs a batch and needs approval; repurpose turns an existing post into new ones; enhance rewrites a prompt before media generation. Pass brandId. Saved drafts are never published.',
    operations: [
      { action: 'content', executes: 'generate_content' },
      { action: 'turbo', executes: 'generate_turbo_content' },
      { action: 'repurpose', executes: 'repurpose_post' },
      { action: 'enhance', executes: 'enhance_prompt' },
    ],
  },
  {
    name: 'generate_media',
    description:
      'Generate and transform media; every action that renders spends credits, so check get_generation_catalog first and poll check_job until the job ends. media makes an image, video, voice or music; transform edits existing media; model_3d makes a 3D model; visual_code, visual_code_revise, visual_code_retry, visual_code_export and visual_code_cancel run coded visuals; plan_video, plan_slideshow and plan_long_form plan a piece and start_video, start_slideshow and start_long_form run the approved plan.',
    operations: [
      { action: 'media', executes: 'generate' },
      { action: 'transform', executes: 'transform_media' },
      { action: 'model_3d', executes: 'render_3d' },
      { action: 'visual_code', executes: 'generate_visual_code' },
      { action: 'visual_code_revise', executes: 'revise_visual_code_project' },
      { action: 'visual_code_retry', executes: 'retry_visual_code_project' },
      { action: 'visual_code_export', executes: 'export_visual_code_project' },
      { action: 'visual_code_cancel', executes: 'cancel_visual_code_project' },
      { action: 'plan_video', executes: 'storyboard_video' },
      { action: 'start_video', executes: 'start_storyboard_video' },
      { action: 'plan_slideshow', executes: 'storyboard_slideshow' },
      {
        action: 'start_slideshow',
        executes: 'start_storyboard_slideshow',
      },
      { action: 'plan_long_form', executes: 'storyboard_long_form' },
      {
        action: 'start_long_form',
        executes: 'start_storyboard_long_form',
      },
    ],
  },
  {
    name: 'setup_brand',
    description:
      'Set a brand up. onboard creates a brand from a URL or details; interview_start, interview_answer and interview_skip run the brand interview; connect_account and connect_oauth link a social account; brand_kit manages the kit (input.action picks what); voice_draft and voice_save draft and save the brand voice; generation_settings sets the brand defaults for generation.',
    claudeActions: [
      'onboard',
      'interview_start',
      'interview_answer',
      'interview_skip',
    ],
    operations: [
      { action: 'onboard', executes: 'onboard_brand' },
      { action: 'interview_start', executes: 'start_brand_interview' },
      { action: 'interview_answer', executes: 'submit_brand_interview_answer' },
      { action: 'interview_skip', executes: 'skip_brand_interview_question' },
      { action: 'connect_account', executes: 'connect_social_account' },
      { action: 'connect_oauth', executes: 'initiate_oauth_connect' },
      { action: 'brand_kit', executes: 'manage_brand_kit' },
      { action: 'voice_draft', executes: 'draft_brand_voice_profile' },
      { action: 'voice_save', executes: 'save_brand_voice_profile' },
      { action: 'generation_settings', executes: 'set_generation_settings' },
    ],
  },
  {
    name: 'find_inspiration',
    description:
      'Fetch outside content to learn from. instagram and instagram_detail read Instagram inspiration for a brand; x_posts and x_account_activity read X posts and the activity of an account. Each call spends provider credits, so say what it costs before calling.',
    operations: [
      { action: 'instagram', executes: 'fetch_instagram_inspiration' },
      {
        action: 'instagram_detail',
        executes: 'fetch_instagram_inspiration_detail',
      },
      { action: 'x_posts', executes: 'fetch_x_posts' },
      { action: 'x_account_activity', executes: 'fetch_x_account_activity' },
    ],
  },
  {
    name: 'save_remix',
    description:
      'Prepare a remix without generating anything. import_source imports a public X, Instagram or TikTok post as a source and needs approval; concept saves a remix concept from an imported source; concept_update edits it at the expected revision; attach_source picks the Library video to analyze; storyboard_remix saves a storyboard remix.',
    operations: [
      { action: 'import_source', executes: 'import_source_post' },
      { action: 'concept', executes: 'create_remix_concept' },
      { action: 'concept_update', executes: 'update_remix_concept' },
      { action: 'attach_source', executes: 'attach_remix_analysis_source' },
      { action: 'storyboard_remix', executes: 'create_storyboard_remix' },
    ],
  },
  {
    name: 'run_remix',
    description:
      'Run a saved remix. quote saves a price quote for a revision without starting it; start runs the exact quote after approval and spends credits; control cancels or resumes a video or avatar run (input.action is cancel or resume); replace_character swaps a storyboard character; status reads the run, its revision, quotes and artifacts and is safe to repeat.',
    operations: [
      { action: 'quote', executes: 'quote_remix_generation' },
      { action: 'start', executes: 'start_remix_generation' },
      { action: 'control', executes: 'control_remix_generation' },
      { action: 'replace_character', executes: 'replace_storyboard_character' },
      { action: 'status', executes: 'get_remix_run' },
    ],
  },
  {
    name: 'run_video_project',
    description:
      'Start and change clip and editor projects. create starts a clip project from a YouTube link; analyze finds highlights for free; run cuts the chosen highlights into clips (avatar clips are held per second and settle to the rendered length); recut moves a finished clip to a new start and end; editor_draft opens clips in the video editor; render exports an editor project. Read projects with get_video_projects.',
    operations: [
      { action: 'create', executes: 'create_clipper_project_from_youtube' },
      { action: 'analyze', executes: 'analyze_clipper_project' },
      { action: 'run', executes: 'run_clipper' },
      { action: 'recut', executes: 'edit_clip' },
      { action: 'editor_draft', executes: 'open_in_editor' },
      { action: 'render', executes: 'start_editor_render' },
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
      'Work in the workspace. new_task records a task and task updates, comments on or completes one; neither starts work. new_chat and chat_message talk to the agent.',
    operations: [
      { action: 'new_task', executes: 'create_task' },
      { action: 'task', executes: 'manage_task' },
      { action: 'new_chat', executes: 'create_chat' },
      { action: 'chat_message', executes: 'send_chat_message' },
    ],
  },
] as const satisfies readonly McpCatalogToolSpec[];

export type McpCatalogToolName = (typeof MCP_CATALOG_TOOLS)[number]['name'];
