export interface AgentSourceTool {
  name: string;
  description: string;
  surfaces?: {
    cliAgentVisible?: boolean;
  };
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  creditCost: number;
}

export const AGENT_SOURCE_TOOLS: AgentSourceTool[] = [
  {
    creditCost: 0,
    description:
      'Generate an image using AI. Provide a detailed prompt describing the desired image. Returns the image URL.',
    name: 'generate_image',
    parameters: {
      properties: {
        aspectRatio: {
          description: 'Aspect ratio of the image',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
          type: 'string',
        },
        prompt: {
          description: 'Detailed text description of the image to generate',
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Reframe an existing image to a new aspect ratio. Provide imageId and target aspect ratio.',
    name: 'reframe_image',
    parameters: {
      properties: {
        aspectRatio: {
          description: 'Target aspect ratio',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
          type: 'string',
        },
        imageId: {
          description: 'ID of the existing image to reframe',
          type: 'string',
        },
      },
      required: ['imageId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Upscale an existing image to higher resolution. Provide the image URL or asset ID.',
    name: 'upscale_image',
    parameters: {
      properties: {
        imageUrl: {
          description: 'URL of the image to upscale',
          type: 'string',
        },
      },
      required: ['imageUrl'],
      type: 'object',
    },
  },
  {
    creditCost: 1,
    description:
      'Perform an AI text action: enhance, rewrite, shorten, expand, generate hashtags, or translate text.',
    name: 'ai_action',
    parameters: {
      properties: {
        action: {
          description: 'The AI action to perform',
          enum: [
            'enhance',
            'rewrite',
            'shorten',
            'expand',
            'hashtags',
            'translate',
          ],
          type: 'string',
        },
        language: {
          description: 'Target language for translate action',
          type: 'string',
        },
        text: {
          description: 'The input text to process',
          type: 'string',
        },
      },
      required: ['action', 'text'],
      type: 'object',
    },
  },
  {
    creditCost: 2,
    description:
      'Generate social media content (caption, post text, article outline) for a given topic or brief.',
    name: 'generate_content',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to use for tone and voice',
          type: 'string',
        },
        platform: {
          description: 'Target social platform',
          enum: [
            'instagram',
            'twitter',
            'linkedin',
            'tiktok',
            'youtube',
            'facebook',
          ],
          type: 'string',
        },
        topic: {
          description: 'Topic or brief for the content',
          type: 'string',
        },
        type: {
          description: 'Type of content to generate',
          enum: ['caption', 'post', 'article_outline', 'thread', 'script'],
          type: 'string',
        },
      },
      required: ['topic', 'type'],
      type: 'object',
    },
  },
  {
    creditCost: 1,
    description:
      'Create a new post draft with the given content and optional media.',
    name: 'create_post',
    parameters: {
      properties: {
        content: {
          description: 'Post text content',
          type: 'string',
        },
        mediaUrls: {
          description: 'Array of media URLs to attach',
          items: { type: 'string' },
          type: 'array',
        },
        platform: {
          description: 'Target platform for the post',
          enum: [
            'instagram',
            'twitter',
            'linkedin',
            'tiktok',
            'youtube',
            'facebook',
          ],
          type: 'string',
        },
      },
      required: ['content'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'List recent posts for the user. Can filter by status (draft, published, scheduled).',
    name: 'list_posts',
    parameters: {
      properties: {
        limit: {
          description: 'Maximum number of posts to return (default 10)',
          type: 'number',
        },
        status: {
          description: 'Filter by post status',
          enum: ['draft', 'published', 'scheduled'],
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 1,
    description:
      'Schedule an existing draft post for a specific date and time.',
    name: 'schedule_post',
    parameters: {
      properties: {
        postId: {
          description: 'ID of the post to schedule',
          type: 'string',
        },
        scheduledAt: {
          description: 'ISO 8601 datetime string for when to publish',
          type: 'string',
        },
      },
      required: ['postId', 'scheduledAt'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description: "List the user's saved workflows.",
    name: 'list_workflows',
    parameters: {
      properties: {
        limit: {
          description: 'Maximum number of workflows to return (default 10)',
          type: 'number',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create a new workflow with a name and optional description. Does not execute it.',
    name: 'create_workflow',
    parameters: {
      properties: {
        description: {
          description: 'Optional description of the workflow',
          type: 'string',
        },
        name: {
          description: 'Name of the workflow',
          type: 'string',
        },
      },
      required: ['name'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Execute a saved workflow by its ID. The workflow itself handles credit deduction.',
    name: 'execute_workflow',
    parameters: {
      properties: {
        workflowId: {
          description: 'ID of the workflow to execute',
          type: 'string',
        },
      },
      required: ['workflowId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Get analytics data for the user. Can specify a time range and metrics.',
    name: 'get_analytics',
    parameters: {
      properties: {
        metric: {
          description: 'Specific metric to retrieve',
          enum: ['engagement', 'reach', 'followers', 'impressions', 'clicks'],
          type: 'string',
        },
        period: {
          description: 'Time period for analytics',
          enum: ['7d', '30d', '90d'],
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Get connection status for a social platform (connected/disconnected) for the current organization.',
    name: 'get_connection_status',
    parameters: {
      properties: {
        platform: {
          description: 'Platform name to check',
          enum: [
            'twitter',
            'instagram',
            'youtube',
            'tiktok',
            'linkedin',
            'facebook',
            'fanvue',
          ],
          type: 'string',
        },
      },
      required: ['platform'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Initiate OAuth connect flow for a platform and return a connect action card.',
    name: 'initiate_oauth_connect',
    parameters: {
      properties: {
        platform: {
          description: 'Platform to connect',
          enum: [
            'twitter',
            'instagram',
            'youtube',
            'tiktok',
            'linkedin',
            'facebook',
            'fanvue',
          ],
          type: 'string',
        },
      },
      required: ['platform'],
      type: 'object',
    },
  },
  {
    creditCost: 1,
    description:
      'Create a campaign from conversation inputs (label, credential, platform, type, and optional settings).',
    name: 'create_campaign',
    parameters: {
      properties: {
        campaignType: {
          description: 'Campaign type',
          enum: ['manual', 'discovery', 'scheduled', 'dm_outreach'],
          type: 'string',
        },
        credential: {
          description: 'Credential ID to run campaign',
          type: 'string',
        },
        description: {
          description: 'Campaign description',
          type: 'string',
        },
        label: {
          description: 'Campaign label',
          type: 'string',
        },
        platform: {
          description: 'Campaign platform',
          enum: ['twitter', 'instagram', 'reddit'],
          type: 'string',
        },
      },
      required: ['label', 'credential', 'platform', 'campaignType'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description: 'Start an existing campaign by ID.',
    name: 'start_campaign',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID',
          type: 'string',
        },
      },
      required: ['campaignId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description: 'Pause an existing campaign by ID.',
    name: 'pause_campaign',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID',
          type: 'string',
        },
      },
      required: ['campaignId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description: 'Mark an existing campaign as completed by ID.',
    name: 'complete_campaign',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID',
          type: 'string',
        },
      },
      required: ['campaignId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description: 'Get analytics summary for a campaign ID.',
    name: 'get_campaign_analytics',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID',
          type: 'string',
        },
      },
      required: ['campaignId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Return deep links for handing off image/video editing to Studio UX.',
    name: 'open_studio_handoff',
    parameters: {
      properties: {
        ingredientId: {
          description: 'Optional ingredient/image ID to open directly',
          type: 'string',
        },
        type: {
          description: 'Studio generator type to open',
          enum: ['image', 'video', 'avatar', 'music'],
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Get current trending topics and hashtags for a given platform.',
    name: 'get_trends',
    parameters: {
      properties: {
        platform: {
          description: 'Platform to get trends for',
          enum: ['twitter', 'tiktok', 'instagram', 'youtube'],
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      "List the user's brands with their names, descriptions, and tone profiles.",
    name: 'list_brands',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      "Get the user's currently selected brand profile for the active organization.",
    name: 'get_current_brand',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create a starter brand from conversational onboarding details (name, handle, niche, voice).',
    name: 'create_brand',
    parameters: {
      properties: {
        description: {
          description: 'Brand description or positioning statement',
          type: 'string',
        },
        handle: {
          description: 'Brand handle, with or without @ prefix',
          type: 'string',
        },
        name: {
          description: 'Brand display name',
          type: 'string',
        },
        niche: {
          description: 'Primary niche for content',
          type: 'string',
        },
        voice: {
          description: 'Preferred brand voice, e.g. casual, edgy, premium',
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Check onboarding setup status and return what is complete vs still missing (brand, credentials, first content).',
    name: 'check_onboarding_status',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Mark onboarding as completed and sync claims/metadata for the current user and organization.',
    name: 'complete_onboarding',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description: "Get the current credit balance for the user's organization.",
    name: 'get_credits_balance',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 5,
    description:
      'Generate a batch of content (images, videos, carousels) for a brand. Specify count, platforms, and date range. Use handle param to resolve @username to a credential. Returns a batch ID for tracking.',
    name: 'generate_content_batch',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to generate content for',
          type: 'string',
        },
        contentMix: {
          description:
            'Content format distribution (e.g., { imagePercent: 60, videoPercent: 25, carouselPercent: 10, reelPercent: 5, storyPercent: 0 })',
          type: 'object',
        },
        count: {
          description: 'Number of content pieces to generate (1-100)',
          type: 'number',
        },
        dateRange: {
          description:
            'Date range for scheduling (e.g., { start: "2026-02-10", end: "2026-02-17" })',
          type: 'object',
        },
        handle: {
          description:
            'Social media handle to resolve (e.g., "@shaylamonroe"). Will auto-resolve to brandId and credential.',
          type: 'string',
        },
        platforms: {
          description: 'Target platforms for content',
          items: { type: 'string' },
          type: 'array',
        },
        style: {
          description:
            'Style direction for generation (e.g., "lifestyle", "professional", "urban")',
          type: 'string',
        },
        topics: {
          description: 'Content topics or themes',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['count', 'platforms'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Resolve a social media handle (@username) to the connected credential and platform. Returns credential ID, platform, and brand ID.',
    name: 'resolve_handle',
    parameters: {
      properties: {
        handle: {
          description:
            'Social media handle to resolve (e.g., "@shaylamonroe" or "shaylamonroe")',
          type: 'string',
        },
      },
      required: ['handle'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'List content items in the review queue. Can filter by batch ID and status.',
    name: 'list_review_queue',
    parameters: {
      properties: {
        batchId: {
          description: 'Filter by specific batch ID',
          type: 'string',
        },
        limit: {
          description: 'Maximum number of items to return (default 20)',
          type: 'number',
        },
        status: {
          description: 'Filter by item status',
          enum: ['pending', 'completed', 'failed'],
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 1,
    description:
      'Approve or reject items in a batch. Approved items get scheduled for publishing. Rejected items are marked for regeneration.',
    name: 'batch_approve_reject',
    parameters: {
      properties: {
        action: {
          description: 'Action to perform on selected items',
          enum: ['approve', 'reject'],
          type: 'string',
        },
        batchId: {
          description: 'Batch ID containing the items',
          type: 'string',
        },
        itemIds: {
          description: 'Array of item IDs to act on',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['batchId', 'action', 'itemIds'],
      type: 'object',
    },
  },
  // ──────────────────────────────────────────────
  // GENERATION TOOLS — call ingredient creation endpoints
  // Provider-agnostic (Replicate, fal, genfeedai, ElevenLabs, etc.)
  // Credits handled by the endpoint's CreditsInterceptor.
  // ──────────────────────────────────────────────
  {
    creditCost: 0,
    description:
      'Generate a video using AI. Provide a detailed prompt describing the desired video. For talking avatar videos, provide imageUrl (portrait image) and audioUrl (audio file) — the model will lip-sync the portrait to the audio. Returns the video URL.',
    name: 'generate_video',
    parameters: {
      properties: {
        aspectRatio: {
          description: 'Aspect ratio of the video',
          enum: ['16:9', '9:16', '1:1'],
          type: 'string',
        },
        audioUrl: {
          description:
            'Audio file URL for avatar/talking-head generation. When provided with imageUrl, uses Kling Avatar V2 for lip-synced portrait animation.',
          type: 'string',
        },
        duration: {
          description: 'Duration in seconds (4-60, default 10)',
          type: 'number',
        },
        imageUrl: {
          description:
            'Portrait image URL for avatar generation, or reference image for image-to-video.',
          type: 'string',
        },
        prompt: {
          description: 'Detailed text description of the video to generate',
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Generate music or audio using AI. Describe the desired music style, mood, instruments, and genre. Returns the audio URL.',
    name: 'generate_music',
    parameters: {
      properties: {
        duration: {
          description: 'Duration in seconds (4-90, default 10)',
          type: 'number',
        },
        text: {
          description:
            'Description of the desired music (mood, genre, instruments, tempo)',
          type: 'string',
        },
      },
      required: ['text'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Generate speech audio from text using text-to-speech. Requires a voice ID from ElevenLabs. Returns the audio URL.',
    name: 'generate_voice',
    parameters: {
      properties: {
        text: {
          description: 'The text to convert to speech',
          type: 'string',
        },
        voiceId: {
          description: 'ElevenLabs voice ID to use for speech synthesis',
          type: 'string',
        },
      },
      required: ['text', 'voiceId'],
      type: 'object',
    },
  },
  // ──────────────────────────────────────────────
  // PROACTIVE AGENT TOOLS
  // ──────────────────────────────────────────────
  {
    creditCost: 1,
    description:
      'Search for relevant posts and tweets to engage with. Returns a list of posts matching the given keywords and platform, sorted by relevance and recency.',
    name: 'discover_engagements',
    parameters: {
      properties: {
        keywords: {
          description: 'Keywords to search for engagement opportunities',
          items: { type: 'string' },
          type: 'array',
        },
        limit: {
          description: 'Maximum number of results (default 20)',
          type: 'number',
        },
        platform: {
          description: 'Platform to search on',
          enum: ['twitter', 'instagram', 'linkedin'],
          type: 'string',
        },
      },
      required: ['keywords', 'platform'],
      type: 'object',
    },
  },
  {
    creditCost: 1,
    description:
      'Draft a reply to a target post and add it to the review queue as an engagement item. The reply will NOT be published until approved.',
    name: 'draft_engagement_reply',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to use for voice and tone',
          type: 'string',
        },
        platform: {
          description: 'Platform of the target post',
          enum: ['twitter', 'instagram', 'linkedin'],
          type: 'string',
        },
        replyContent: {
          description: 'The drafted reply text',
          type: 'string',
        },
        targetAuthor: {
          description: 'Author of the target post',
          type: 'string',
        },
        targetPostContent: {
          description: 'Content of the post being replied to',
          type: 'string',
        },
        targetPostId: {
          description: 'External ID of the post to reply to',
          type: 'string',
        },
        targetPostUrl: {
          description: 'URL of the post to reply to',
          type: 'string',
        },
      },
      required: ['targetPostId', 'replyContent', 'platform'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Get a summary of items pending approval in the review queue. Returns counts by type (content vs engagement), oldest pending age, and breakdown by status.',
    name: 'get_approval_summary',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Analyze recent content performance over the last 30 days. Returns engagement rates grouped by content type, platform, and posting time, plus top-performing posts.',
    name: 'analyze_performance',
    parameters: {
      properties: {
        days: {
          description: 'Number of days to analyze (default 30)',
          type: 'number',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Get the content calendar for the coming week. Returns scheduled and draft posts with gap analysis showing days without content.',
    name: 'get_content_calendar',
    parameters: {
      properties: {
        days: {
          description: 'Number of days ahead to look (default 7)',
          type: 'number',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Internal bookkeeping tool — records what the proactive agent accomplished during this run. Call this at the end of a proactive session.',
    name: 'update_strategy_state',
    parameters: {
      properties: {
        contentGenerated: {
          description: 'Number of content items generated this run',
          type: 'number',
        },
        engagementsFound: {
          description: 'Number of engagement opportunities found',
          type: 'number',
        },
        repliesDrafted: {
          description: 'Number of engagement replies drafted',
          type: 'number',
        },
        summary: {
          description: 'Brief summary of what was accomplished',
          type: 'string',
        },
      },
      required: ['summary'],
      type: 'object',
    },
  },
  // ──────────────────────────────────────────────
  // ONBOARDING FLOW TOOLS
  // ──────────────────────────────────────────────
  {
    creditCost: 0,
    description:
      'Prompt the user to connect a social media account via OAuth. Sends a UI action card to the frontend with a connect button for the specified platform.',
    name: 'connect_social_account',
    parameters: {
      properties: {
        platform: {
          description: 'Social platform to connect',
          enum: [
            'twitter',
            'instagram',
            'linkedin',
            'tiktok',
            'youtube',
            'facebook',
          ],
          type: 'string',
        },
      },
      required: ['platform'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Generate sample content during onboarding — 3 tweets + 3 images using cheap models. Credits are deducted from free signup balance. Returns preview URLs and text.',
    name: 'generate_onboarding_content',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to generate content for',
          type: 'string',
        },
      },
      required: ['brandId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Present credit pack payment options to the user as a UI action card. Shows pricing tiers with a checkout button.',
    name: 'present_payment_options',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 5,
    description:
      'Generate a full month of content (30 days) for a brand. Creates a content plan with a mix of tweets, images, and videos, then executes it. Requires credits.',
    name: 'generate_monthly_content',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to generate content for',
          type: 'string',
        },
        platforms: {
          description: 'Target platforms for content',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['brandId', 'platforms'],
      type: 'object',
    },
  },
  // ──────────────────────────────────────────────
  // IDENTITY TOOLS
  // ──────────────────────────────────────────────
  {
    creditCost: 0,
    description:
      "Generate an avatar video using the user's identity (default avatar photo + cloned voice from org settings). Provide text for the voice to speak. Uses HeyGen photo avatar API. Credits handled by the endpoint's CreditsInterceptor.",
    name: 'generate_as_identity',
    parameters: {
      properties: {
        text: {
          description: 'The text for the avatar to speak',
          type: 'string',
        },
      },
      required: ['text'],
      type: 'object',
    },
  },
  // ──────────────────────────────────────────────
  // DASHBOARD TOOLS
  // ──────────────────────────────────────────────
  {
    creditCost: 0,
    description:
      'Render dynamic UI blocks on the analytics dashboard. Fetch data with other tools first, then call this to display it. See system prompt for block type reference and examples.',
    name: 'render_dashboard',
    parameters: {
      properties: {
        blockIds: {
          description: 'Block IDs to remove (for remove operation)',
          items: { type: 'string' },
          type: 'array',
        },
        blocks: {
          description:
            'UI blocks to render. Each block must have id (string), type (metric_card|kpi_grid|chart|table|top_posts|alert|markdown|image_grid|composite|empty_state), and optional width (full|half|third). Chart blocks need chartType (area|bar|line|pie), data array, and optional xAxis/series. Table blocks need columns and rows arrays. KPI grid blocks need a cards array of metric_card blocks.',
          items: {
            properties: {
              cards: {
                description: 'Array of metric_card blocks (for kpi_grid)',
                items: { type: 'object' },
                type: 'array',
              },
              chartType: {
                description: 'Chart visualization type',
                enum: ['area', 'bar', 'line', 'pie'],
                type: 'string',
              },
              columns: {
                description:
                  'Table columns: [{ key, label, sortable?, align? }] or number of columns for kpi_grid/image_grid',
              },
              content: {
                description: 'Markdown content string (for markdown block)',
                type: 'string',
              },
              data: {
                description:
                  'Chart data array of objects (each object is a data point)',
                items: { type: 'object' },
                type: 'array',
              },
              id: {
                description: 'Unique block ID for updates/removal',
                type: 'string',
              },
              message: {
                description: 'Text message (for alert/empty_state)',
                type: 'string',
              },
              rows: {
                description: 'Table row data array of objects',
                items: { type: 'object' },
                type: 'array',
              },
              series: {
                description: 'Chart series config: [{ key, label, color? }]',
                items: { type: 'object' },
                type: 'array',
              },
              severity: {
                description: 'Alert severity',
                enum: ['info', 'warning', 'error', 'success'],
                type: 'string',
              },
              subtitle: { type: 'string' },
              title: { type: 'string' },
              trend: {
                description:
                  'Trend indicator for metric_card: { direction: up|down|flat, percentage }',
                type: 'object',
              },
              type: {
                description: 'Block type',
                enum: [
                  'metric_card',
                  'kpi_grid',
                  'chart',
                  'table',
                  'top_posts',
                  'alert',
                  'markdown',
                  'image_grid',
                  'composite',
                  'empty_state',
                ],
                type: 'string',
              },
              value: {
                description: 'Display value for metric_card (string or number)',
              },
              width: {
                description: 'Grid width',
                enum: ['full', 'half', 'third'],
                type: 'string',
              },
              xAxis: {
                description: 'Key in data objects to use as x-axis',
                type: 'string',
              },
            },
            required: ['id', 'type'],
            type: 'object',
          },
          type: 'array',
        },
        operation: {
          description:
            'How to modify the dashboard: replace (full rebuild), add (append), update (modify by id), remove (delete by id), clear (reset)',
          enum: ['replace', 'add', 'update', 'remove', 'clear'],
          type: 'string',
        },
      },
      required: ['operation'],
      type: 'object',
    },
  },
  // ──────────────────────────────────────────────
  // GENERATION PREPARATION TOOLS
  // ──────────────────────────────────────────────
  {
    creditCost: 0,
    description:
      "List the org's top workflows so the user can pick one to trigger directly from the conversation. Returns a workflow_trigger_card UI card. Use this when the user wants to run a workflow but hasn't specified which one.",
    name: 'prepare_workflow_trigger',
    parameters: {
      properties: {
        limit: {
          description: 'Maximum number of workflows to show (default 5, max 5)',
          type: 'number',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Prepare a voice clone action card. Detects existing cloned voices for the active brand/org and allows selecting one or uploading a new audio sample inline.',
    name: 'prepare_voice_clone',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Prepare a guided clip run card for X/Twitter-first video creation. Creates a conversation card with step controls for generate -> optional merge -> portrait reframe -> publish handoff. Use when users ask for 30-second clips, AI clone videos, or multi-step workflow-controlled video runs.',
    name: 'prepare_clip_workflow_run',
    parameters: {
      properties: {
        autonomousMode: {
          description:
            'If true, auto-run non-publish steps where possible. Publish still requires confirmation.',
          type: 'boolean',
        },
        durationSeconds: {
          description: 'Target duration in seconds (default 30, max 60).',
          type: 'number',
        },
        mergeGeneratedVideos: {
          description:
            'If true, allow merging multiple generated clips before reframe.',
          type: 'boolean',
        },
        model: {
          description: 'Optional video model key override.',
          type: 'string',
        },
        prompt: {
          description: 'Prompt or brief for the clip generation.',
          type: 'string',
        },
        requireStepConfirmation: {
          description:
            'If true, ask user to confirm each major step in the run card.',
          type: 'boolean',
        },
        workflowId: {
          description: 'Optional workflow ID to pre-bind and trigger.',
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Suggest 2–3 alternative generation prompts for a different angle, style, or variation. Each alternative has a short label and a full prompt. Returns an ingredient_alternatives_card so the user can click one to generate inline.',
    name: 'suggest_ingredient_alternatives',
    parameters: {
      properties: {
        alternatives: {
          description:
            'Array of 2–3 alternative prompts. Each item has a short label and a full generation prompt.',
          items: {
            properties: {
              label: {
                description:
                  'Short descriptive label (e.g. "Close-up", "Wide angle")',
                type: 'string',
              },
              prompt: {
                description: 'Full generation prompt for this alternative',
                type: 'string',
              },
            },
            required: ['label', 'prompt'],
            type: 'object',
          },
          type: 'array',
        },
        generationType: {
          description: 'Type of content to generate',
          enum: ['image', 'video'],
          type: 'string',
        },
      },
      required: ['generationType', 'alternatives'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Spawn a specialized sub-agent to create a specific type of content. Use for video, image, article, or tweet/thread creation. The sub-agent inherits brand context and applies platform-specific expertise and tools. Sub-agent charges its own credits for content it generates.',
    name: 'spawn_content_agent',
    parameters: {
      properties: {
        agentType: {
          description:
            'Type of content specialist to spawn. x_content for tweets/threads, image_creator for images/carousels, video_creator for short-form video, ai_avatar for AI avatar videos, article_writer for long-form articles/blog posts.',
          enum: [
            'x_content',
            'image_creator',
            'video_creator',
            'ai_avatar',
            'article_writer',
          ],
          type: 'string',
        },
        credentialId: {
          description:
            'Target social account credential ID. Provides the sub-agent with account-specific context (handle, platform, audience).',
          type: 'string',
        },
        task: {
          description:
            'Detailed content brief for the sub-agent. Include topic, tone, format, and any specific requirements.',
          type: 'string',
        },
      },
      required: ['agentType', 'task'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Prepare an image or video generation and return an interactive action card so the user can review and adjust parameters (model, aspect ratio, duration, prompt) before generating. Use this instead of generate_image/generate_video when: (1) the request is complex or ambiguous, (2) the user explicitly asks to pick a model or tweak settings, (3) the user says "help me choose" or "show me options". For simple, clear requests like "generate a cat image", use generate_image/generate_video directly.',
    name: 'prepare_generation',
    parameters: {
      properties: {
        aspectRatio: {
          description: 'Suggested aspect ratio (e.g., "1:1", "16:9", "9:16")',
          type: 'string',
        },
        duration: {
          description: 'Suggested duration in seconds (video only)',
          type: 'number',
        },
        generationType: {
          description: 'Type of content to generate',
          enum: ['image', 'video'],
          type: 'string',
        },
        model: {
          description:
            'Suggested model key in "provider/model-name" format (optional — if omitted, the card will let the user pick). Image models: google/imagen-4, google/imagen-4-ultra, google/imagen-4-fast, google/nano-banana-2, google/nano-banana-pro, google/nano-banana, black-forest-labs/flux-2-pro, black-forest-labs/flux-1.1-pro, black-forest-labs/flux-schnell, black-forest-labs/flux-kontext-pro, ideogram-ai/ideogram-v3-quality, ideogram-ai/ideogram-v3-balanced, ideogram-ai/ideogram-v3-turbo, bytedance/seedream-4.5, bytedance/seedream-4, openai/gpt-image-1.5, runwayml/gen4-image-turbo, qwen/qwen-image. Video models: google/veo-3.1, google/veo-3, google/veo-2, kwaivgi/kling-v3-video, kwaivgi/kling-v2.1, openai/sora-2. If the user says "use X" or "with X", X is a model name — set model to the matching key and write a separate creative prompt.',
          type: 'string',
        },
        prompt: {
          description:
            "The generation prompt — must go beyond the user's raw input. For images: include scene composition, subjects, lighting, style, and camera details. For videos: include action, camera movement, pacing, and mood. For audio/music: include genre, tempo, instruments, and structure. Always enhance with professional-grade detail appropriate to the medium.",
          type: 'string',
        },
      },
      required: ['generationType', 'prompt'],
      type: 'object',
    },
  },
  // ──────────────────────────────────────────────
  // INGREDIENT PICKER TOOL
  // ──────────────────────────────────────────────
  {
    creditCost: 0,
    description:
      'Show the user a picker card with up to 9 media assets (images and videos) from their library so they can select one as an ingredient for generation. Use this when the user wants to pick an existing image or video from their library. Optionally filter by brand.',
    name: 'select_ingredient',
    parameters: {
      properties: {
        brandId: {
          description:
            'Optional brand ID to filter assets by. If omitted, fetches across all brands in the organization.',
          type: 'string',
        },
        mediaType: {
          description:
            'Filter by media type. Defaults to both images and videos.',
          enum: ['image', 'video', 'all'],
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
  },
  // ──────────────────────────────────────────────
  // CAMPAIGN COORDINATION TOOLS
  // ──────────────────────────────────────────────
  {
    creditCost: 0,
    description:
      'Request an asset from another agent in the same campaign. Creates a sub-run for the target agent with the given specifications. The target agent will generate the asset and deliver it back.',
    name: 'request_asset',
    parameters: {
      properties: {
        assetType: {
          description: 'Type of asset to request',
          enum: ['image', 'video', 'text', 'audio'],
          type: 'string',
        },
        prompt: {
          description: 'Detailed prompt describing the desired asset',
          type: 'string',
        },
        specifications: {
          description:
            'Additional specifications (aspect ratio, duration, style, etc.)',
          type: 'object',
        },
        targetAgentId: {
          description: 'Strategy ID of the agent to request the asset from',
          type: 'string',
        },
      },
      required: ['targetAgentId', 'assetType', 'prompt'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create a post draft from text, or prepare and confirm direct publishing for an existing content item or ingredient by returning a publish confirmation card first.',
    name: 'create_post',
    parameters: {
      properties: {
        caption: {
          description:
            'Optional caption override to publish with the selected content item.',
          type: 'string',
        },
        confirmed: {
          description:
            'Set to true only after the user confirms the publish card.',
          type: 'boolean',
        },
        content: {
          description:
            'Draft post text content when creating a standalone draft post.',
          type: 'string',
        },
        contentId: {
          description:
            'Existing content or ingredient ID to publish directly from chat.',
          type: 'string',
        },
        ingredientId: {
          description: 'Existing ingredient ID to publish directly from chat.',
          type: 'string',
        },
        mediaUrls: {
          description:
            'Optional media URLs to attach when creating a standalone draft post.',
          items: { type: 'string' },
          type: 'array',
        },
        platform: {
          description:
            'Legacy single-platform hint when creating a standalone draft post.',
          enum: [
            'instagram',
            'twitter',
            'linkedin',
            'tiktok',
            'youtube',
            'facebook',
          ],
          type: 'string',
        },
        platforms: {
          description:
            'Platforms to publish the selected content item to after confirmation.',
          items: {
            enum: [
              'instagram',
              'twitter',
              'linkedin',
              'tiktok',
              'youtube',
              'facebook',
            ],
            type: 'string',
          },
          type: 'array',
        },
        scheduledAt: {
          description:
            'Optional ISO datetime for scheduling the direct publish instead of publishing immediately.',
          type: 'string',
        },
        textContent: {
          description:
            'Optional text content or caption to reuse for the publish confirmation card.',
          type: 'string',
        },
      },
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Get organization analytics, a post analytics snapshot, or analytics for the latest published post related to a selected content item.',
    name: 'get_analytics',
    parameters: {
      properties: {
        contentId: {
          description:
            'Existing content or ingredient ID to resolve to the latest related published post analytics.',
          type: 'string',
        },
        ingredientId: {
          description:
            'Existing ingredient ID to resolve to the latest related published post analytics.',
          type: 'string',
        },
        metric: {
          description:
            'Specific metric to retrieve for organization summaries.',
          enum: ['engagement', 'reach', 'followers', 'impressions', 'clicks'],
          type: 'string',
        },
        period: {
          description: 'Time period for organization analytics summaries.',
          enum: ['7d', '30d', '90d'],
          type: 'string',
        },
        postId: {
          description: 'Existing post ID to fetch a direct analytics snapshot.',
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Save content, examples, preferences, or winners into agent memory and optionally route them to brand knowledge.',
    name: 'capture_memory',
    parameters: {
      properties: {
        brandId: {
          description: 'Optional brand ID for brand-scoped saves',
          type: 'string',
        },
        confidence: {
          description:
            'How confident the system should be in reusing this memory (0-1)',
          type: 'number',
        },
        content: {
          description: 'The content or instruction to save',
          type: 'string',
        },
        contentType: {
          description: 'What kind of content this memory applies to',
          enum: ['newsletter', 'tweet', 'thread', 'article', 'post', 'generic'],
          type: 'string',
        },
        importance: {
          description: 'Importance weight for retrieval (0-1)',
          type: 'number',
        },
        kind: {
          description: 'How this memory should be interpreted',
          enum: [
            'preference',
            'positive_example',
            'negative_example',
            'winner',
            'reference',
            'instruction',
            'pattern',
          ],
          type: 'string',
        },
        performanceSnapshot: {
          description:
            'Optional performance data associated with the saved content',
          type: 'object',
        },
        platform: {
          description:
            'Optional platform label such as twitter, beehiiv, or linkedin',
          type: 'string',
        },
        saveToContextMemory: {
          description:
            'Whether to also save this content to the brand context memory layer',
          type: 'boolean',
        },
        scope: {
          description: 'Whether the save is personal or brand-scoped',
          enum: ['user', 'brand'],
          type: 'string',
        },
        sourceContentId: {
          description: 'Optional ID of the related content item',
          type: 'string',
        },
        sourceMessageId: {
          description: 'Optional thread message ID this came from',
          type: 'string',
        },
        sourceType: {
          description: 'Where this memory came from',
          type: 'string',
        },
        sourceUrl: {
          description: 'Optional URL for the source material',
          type: 'string',
        },
        summary: {
          description: 'Short reusable summary of the saved content',
          type: 'string',
        },
        tags: {
          description: 'Optional retrieval tags',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['content'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Resolve the best official workflow source for the request, ask for confirmation, then install it into the current organization. Prefer seeded templates first, official marketplace workflows second, and only generate a new workflow as fallback.',
    name: 'install_official_workflow',
    parameters: {
      properties: {
        brandId: {
          description:
            'Optional brand ID to attach to the installed workflow after bootstrap.',
          type: 'string',
        },
        confirmed: {
          description:
            'Set to true only after the user confirms installation or generation.',
          type: 'boolean',
        },
        contentType: {
          description:
            'Optional content type hint for resolving the right workflow.',
          enum: ['image', 'video', 'post', 'newsletter'],
          type: 'string',
        },
        label: {
          description: 'Optional workflow label for the installed copy.',
          type: 'string',
        },
        platform: {
          description:
            'Optional platform hint such as linkedin, instagram, or tiktok.',
          type: 'string',
        },
        prompt: {
          description:
            'What the workflow should accomplish so the resolver can match the best official source.',
          type: 'string',
        },
        schedule: {
          description:
            'Optional cron expression to apply to the installed workflow.',
          type: 'string',
        },
        sourceDescription: {
          description:
            'Resolved source description from a prior confirmation step.',
          type: 'string',
        },
        sourceId: {
          description: 'Resolved source ID from a prior confirmation step.',
          type: 'string',
        },
        sourceName: {
          description: 'Resolved source name from a prior confirmation step.',
          type: 'string',
        },
        sourceSlug: {
          description:
            'Resolved marketplace slug from a prior confirmation step.',
          type: 'string',
        },
        sourceType: {
          description: 'Resolved source type from a prior confirmation step.',
          enum: ['seeded-template', 'marketplace-listing', 'generated'],
          type: 'string',
        },
        timezone: {
          description: 'Optional timezone for the workflow schedule.',
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create a workflow for the current organization and brand. Supports direct graph persistence, recurring automation scaffolds, and natural-language workflow generation so the result can be edited in the Workflows app.',
    name: 'create_workflow',
    parameters: {
      properties: {
        aspectRatio: {
          description:
            'Optional visual aspect ratio for generated recurring assets.',
          enum: ['1:1', '4:5', '9:16', '16:9'],
          type: 'string',
        },
        brandId: {
          description:
            'Optional explicit brand ID to attach to the workflow; otherwise uses the current selected brand when available.',
          type: 'string',
        },
        contentType: {
          description:
            'Optional recurring content type when scaffolding a workflow from a brief.',
          enum: ['image', 'video', 'post', 'newsletter'],
          type: 'string',
        },
        count: {
          description:
            'Optional number of assets to generate per scheduled run for recurring workflows.',
          type: 'number',
        },
        description: {
          description:
            'Optional natural-language description of the workflow to generate or save.',
          type: 'string',
        },
        diversityMode: {
          description:
            'Optional variation level for recurring generated assets in the same run.',
          enum: ['low', 'medium', 'high'],
          type: 'string',
        },
        edges: {
          description: 'Optional workflow graph edges',
          items: { type: 'object' },
          type: 'array',
        },
        inputVariables: {
          description: 'Optional workflow input variable definitions',
          items: { type: 'object' },
          type: 'array',
        },
        isScheduleEnabled: {
          description: 'Whether the workflow schedule should be enabled',
          type: 'boolean',
        },
        label: {
          description: 'Workflow label shown in the Workflows app',
          type: 'string',
        },
        metadata: {
          description: 'Optional workflow metadata',
          type: 'object',
        },
        model: {
          description:
            'Optional generation model override for recurring flows.',
          type: 'string',
        },
        negativePrompt: {
          description:
            'Optional constraints for what recurring generations should avoid.',
          type: 'string',
        },
        nodes: {
          description: 'Optional workflow graph nodes',
          items: { type: 'object' },
          type: 'array',
        },
        prompt: {
          description:
            'Optional recurring generation brief. When paired with schedule, this scaffolds a recurring workflow.',
          type: 'string',
        },
        schedule: {
          description: 'Optional cron expression for workflow recurrence',
          type: 'string',
        },
        sourceAssetId: {
          description:
            'Optional source asset ID to attach to a recurring workflow brief.',
          type: 'string',
        },
        steps: {
          description: 'Optional legacy step definitions',
          items: { type: 'object' },
          type: 'array',
        },
        styleNotes: {
          description:
            'Optional creative direction or brand guardrails for recurring workflows.',
          type: 'string',
        },
        targetPlatforms: {
          description:
            'Optional platform hints used during natural-language workflow generation.',
          items: { type: 'string' },
          type: 'array',
        },
        templateId: {
          description: 'Optional workflow template ID',
          type: 'string',
        },
        timezone: {
          description: 'Optional timezone for the schedule',
          type: 'string',
        },
        trigger: {
          description: 'Optional trigger mode for the workflow',
          type: 'string',
        },
      },
      required: ['label'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create a YouTube or Twitch livestream chat bot for the current organization and brand, then return a bot card with links and basic control actions.',
    name: 'create_livestream_bot',
    parameters: {
      properties: {
        botChannelLabel: {
          description:
            'Optional human-readable label for the YouTube or Twitch channel.',
          type: 'string',
        },
        botChannelUrl: {
          description:
            'Optional URL for the YouTube or Twitch channel or profile.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional explicit brand ID to attach to the bot; otherwise uses the current selected brand when available.',
          type: 'string',
        },
        channelId: {
          description:
            'Required platform target identifier for the livestream channel or account.',
          type: 'string',
        },
        contextTemplate: {
          description:
            'Optional context-aware question template for automatic chat prompts.',
          type: 'string',
        },
        credentialId: {
          description:
            'Optional credential ID used to post to the livestream target.',
          type: 'string',
        },
        description: {
          description: 'Optional bot description.',
          type: 'string',
        },
        hostPromptTemplate: {
          description:
            'Optional host prompt template for scheduled automatic posts.',
          type: 'string',
        },
        label: {
          description: 'Bot label shown in the bots area.',
          type: 'string',
        },
        linkLabel: {
          description: 'Optional label for the primary chat link drop.',
          type: 'string',
        },
        linkUrl: {
          description: 'Optional URL used for scheduled link drops.',
          type: 'string',
        },
        liveChatId: {
          description: 'Optional YouTube Live chat identifier when available.',
          type: 'string',
        },
        maxAutoPostsPerHour: {
          description:
            'Optional maximum number of automatic posts per hour per platform.',
          type: 'number',
        },
        minimumMessageGapSeconds: {
          description:
            'Optional minimum number of seconds between automatic posts.',
          type: 'number',
        },
        platform: {
          description: 'Livestream platform for the bot.',
          enum: ['youtube', 'twitch'],
          type: 'string',
        },
        scheduledCadenceMinutes: {
          description:
            'Optional number of minutes between scheduled automatic posts.',
          type: 'number',
        },
        senderId: {
          description: 'Optional Twitch sender ID used for message delivery.',
          type: 'string',
        },
        transcriptEnabled: {
          description: 'Optional flag controlling transcript-assisted context.',
          type: 'boolean',
        },
      },
      required: ['channelId', 'label', 'platform'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Manage an existing YouTube or Twitch livestream chat bot session by starting, pausing, resuming, stopping, setting a manual override, or sending a message immediately.',
    name: 'manage_livestream_bot',
    parameters: {
      properties: {
        action: {
          description: 'The livestream bot action to perform.',
          enum: [
            'start_session',
            'pause_session',
            'resume_session',
            'stop_session',
            'set_override',
            'send_now',
          ],
          type: 'string',
        },
        activeLinkId: {
          description: 'Optional active link ID for a manual override.',
          type: 'string',
        },
        botId: {
          description: 'Existing bot ID to manage.',
          type: 'string',
        },
        message: {
          description:
            'Optional explicit message for send_now. If omitted, the bot will generate one.',
          type: 'string',
        },
        platform: {
          description: 'Platform to target for send_now actions.',
          enum: ['youtube', 'twitch'],
          type: 'string',
        },
        promotionAngle: {
          description: 'Optional promotion angle for manual override context.',
          type: 'string',
        },
        topic: {
          description: 'Optional topic for manual override context.',
          type: 'string',
        },
        type: {
          description:
            'Optional message type for send_now when the message should be generated automatically.',
          enum: [
            'scheduled_link_drop',
            'scheduled_host_prompt',
            'context_aware_question',
          ],
          type: 'string',
        },
      },
      required: ['action', 'botId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Rate content quality from 1-10 and return actionable feedback and improvement suggestions.',
    name: 'rate_content',
    parameters: {
      properties: {
        contentId: {
          description: 'ID of the content item to rate',
          type: 'string',
        },
        contentType: {
          description: 'Type of content to rate',
          enum: ['image', 'video', 'post'],
          type: 'string',
        },
        context: {
          description:
            'Optional context for scoring criteria, campaign goals, or audience',
          type: 'string',
        },
      },
      required: ['contentId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Add or remove a boolean vote on an ingredient (single vote toggle per user).',
    name: 'rate_ingredient',
    parameters: {
      properties: {
        ingredientId: {
          description: 'Ingredient ID to vote or unvote',
          type: 'string',
        },
      },
      required: ['ingredientId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Get the most-voted ingredients for this organization, optionally filtered by brand or category.',
    name: 'get_top_ingredients',
    parameters: {
      properties: {
        brandId: {
          description: 'Optional brand ID filter',
          type: 'string',
        },
        category: {
          description: 'Optional ingredient category filter',
          enum: ['image', 'video', 'music', 'avatar', 'gif'],
          type: 'string',
        },
        limit: {
          description: 'Maximum number of ingredients to return (default 10)',
          type: 'number',
        },
      },
      required: [],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Prepare a replication plan for a top ingredient and return source metadata with next actions.',
    name: 'replicate_top_ingredient',
    parameters: {
      properties: {
        ingredientId: {
          description: 'Source ingredient ID to replicate',
          type: 'string',
        },
        variations: {
          description: 'How many variations to create (default 3)',
          type: 'number',
        },
      },
      required: ['ingredientId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Create a measurable agent goal for the current organization or brand using one analytics metric.',
    name: 'create_goal',
    parameters: {
      properties: {
        brandId: { type: 'string' },
        description: { type: 'string' },
        endDate: { type: 'string' },
        isActive: { type: 'boolean' },
        label: { type: 'string' },
        metric: {
          enum: ['engagement_rate', 'posts', 'views'],
          type: 'string',
        },
        startDate: { type: 'string' },
        targetValue: { type: 'number' },
      },
      required: ['label', 'metric', 'targetValue'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Check progress for an existing agent goal using current analytics data.',
    name: 'check_goal_progress',
    parameters: {
      properties: {
        goalId: { type: 'string' },
      },
      required: ['goalId'],
      type: 'object',
    },
  },
  {
    creditCost: 0,
    description:
      'Update an existing agent goal to change its target, dates, description, or active state.',
    name: 'update_goal',
    parameters: {
      properties: {
        description: { type: 'string' },
        endDate: { type: 'string' },
        goalId: { type: 'string' },
        isActive: { type: 'boolean' },
        label: { type: 'string' },
        metric: {
          enum: ['engagement_rate', 'posts', 'views'],
          type: 'string',
        },
        startDate: { type: 'string' },
        targetValue: { type: 'number' },
      },
      required: ['goalId'],
      type: 'object',
    },
  },
];
