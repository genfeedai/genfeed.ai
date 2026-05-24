export interface SourceTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  creditCost: number;
  requiredRole: 'user' | 'admin' | 'superadmin';
  surfaces: {
    agent: boolean;
    mcp: boolean;
    cliAgentVisible?: boolean;
  };
}

// ──────────────────────────────────────────────
// OVERLAP TOOLS (agent: true, mcp: true)
// For each: longer description, more properties, max requiredRole, creditCost from agent.
// ──────────────────────────────────────────────

const OVERLAP_TOOLS: SourceTool[] = [
  // create_post: agent params (9 props) > mcp params (4 props); agent desc longer
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
  // create_workflow: agent params (20+ props) > mcp params (5 props); agent desc longer
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
  // execute_workflow: mcp params (2 props) > agent params (1 prop); mcp desc longer
  {
    creditCost: 0,
    description:
      'Execute an existing workflow immediately. Optionally pass variables to customize the execution.',
    name: 'execute_workflow',
    parameters: {
      properties: {
        variables: {
          description:
            'Optional variables to pass to the workflow (e.g., topic, style, platforms)',
          type: 'object',
        },
        workflowId: {
          description: 'ID of the workflow to execute',
          type: 'string',
        },
      },
      required: ['workflowId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
  // generate_image: mcp params (4 props) > agent params (2 props); mcp desc longer
  {
    creditCost: 0,
    description:
      'Generate AI images with custom prompts, styles, and dimensions. Perfect for social media, blogs, and marketing materials.',
    name: 'generate_image',
    parameters: {
      properties: {
        prompt: {
          description: 'Description of the image to generate',
          type: 'string',
        },
        quality: {
          default: 'standard',
          description: 'Image quality',
          enum: ['standard', 'hd'],
          type: 'string',
        },
        size: {
          default: 'square',
          description: 'Image dimensions',
          enum: [
            'square',
            'portrait',
            'landscape',
            '1024x1024',
            '1792x1024',
            '1024x1792',
          ],
          type: 'string',
        },
        style: {
          default: 'realistic',
          description: 'Artistic style',
          enum: [
            'realistic',
            'artistic',
            'abstract',
            'cartoon',
            'photographic',
            'digital-art',
          ],
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
  // generate_music: mcp params (4 props) = agent params (2 props) → mcp wins; agent desc longer
  {
    creditCost: 0,
    description:
      'Generate music or audio using AI. Describe the desired music style, mood, instruments, and genre. Returns the audio URL.',
    name: 'generate_music',
    parameters: {
      properties: {
        duration: {
          default: 60,
          description: 'Duration in seconds',
          maximum: 300,
          minimum: 10,
          type: 'number',
        },
        genre: {
          description: 'Music genre',
          enum: [
            'ambient',
            'electronic',
            'rock',
            'classical',
            'jazz',
            'pop',
            'cinematic',
          ],
          type: 'string',
        },
        mood: {
          description: 'Music mood',
          enum: [
            'upbeat',
            'calm',
            'energetic',
            'dramatic',
            'happy',
            'sad',
            'inspirational',
          ],
          type: 'string',
        },
        prompt: {
          description: 'Description of the music to generate',
          type: 'string',
        },
      },
      required: ['prompt'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
  // generate_video: agent and mcp both have 5 props → agent wins (equal, a is chosen); agent desc longer
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
  // get_credits_balance: both 0 props; mcp desc longer
  {
    creditCost: 0,
    description:
      'Get available credits balance and usage information for your account',
    name: 'get_credits_balance',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
  // get_trends: mcp params (2 props) > agent params (1 prop); mcp desc longer
  {
    creditCost: 0,
    description:
      'Get trending topics and content ideas based on current trends across social media and news.',
    name: 'get_trends',
    parameters: {
      properties: {
        category: {
          default: 'all',
          description: 'Content category',
          enum: [
            'all',
            'tech',
            'business',
            'entertainment',
            'sports',
            'science',
            'health',
            'politics',
          ],
          type: 'string',
        },
        timeframe: {
          default: '24h',
          description: 'Timeframe for trends',
          enum: ['24h', '7d', '30d'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
  // list_brands: mcp params (1 prop) > agent params (0 props); agent desc longer
  {
    creditCost: 0,
    description:
      "List the user's brands with their names, descriptions, and tone profiles.",
    name: 'list_brands',
    parameters: {
      properties: {
        limit: {
          default: 20,
          description: 'Maximum number of brands to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
  // list_posts: agent and mcp both 2 props → agent wins (equal); agent desc longer
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
  // list_workflows: mcp params (2 props) > agent params (1 prop); mcp desc longer
  {
    creditCost: 0,
    description:
      'List all workflows in your organization with optional status filtering.',
    name: 'list_workflows',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of workflows to return',
          type: 'number',
        },
        status: {
          description: 'Filter by workflow status',
          enum: ['draft', 'active', 'paused', 'completed', 'failed'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: true },
  },
];

// ──────────────────────────────────────────────
// AGENT-ONLY TOOLS (agent: true, mcp: false)
// ──────────────────────────────────────────────

const AGENT_ONLY_TOOLS: SourceTool[] = [
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 0,
    description:
      'Get analytics data for the user. Can specify a time range and metrics.',
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
            'Suggested model key in "provider/model-name" format (optional — if omitted, the card will let the user pick). Image models: google/imagen-4, google/imagen-4-ultra, google/imagen-4-fast, google/nano-banana-2, google/nano-banana-pro, google/nano-banana, black-forest-labs/flux-2-pro, black-forest-labs/flux-2-max, black-forest-labs/flux-1.1-pro, black-forest-labs/flux-schnell, black-forest-labs/flux-kontext-pro, black-forest-labs/flux-kontext-max, ideogram-ai/ideogram-v3-quality, ideogram-ai/ideogram-v3-balanced, ideogram-ai/ideogram-v3-turbo, bytedance/seedream-4.5, bytedance/seedream-4, bytedance/seedream-5-lite, openai/gpt-image-1.5, openai/gpt-image-2, recraft-ai/recraft-v4, recraft-ai/recraft-v4-pro, xai/grok-imagine-image, runwayml/gen4-image-turbo, qwen/qwen-image. Video models: google/veo-3.1, google/veo-3.1-lite, google/veo-3, google/veo-2, bytedance/seedance-2.0, bytedance/seedance-2.0-fast, kwaivgi/kling-v3-video, kwaivgi/kling-v2.6, kwaivgi/kling-v2.1, kwaivgi/kling-o1, pixverse/pixverse-v6, xai/grok-imagine-video, runwayml/gen-4.5, minimax/hailuo-2.3, minimax/hailuo-2.3-fast, vidu/q3-pro, vidu/q3-turbo, wan-video/wan-2.7-t2v, openai/sora-2. If the user says "use X" or "with X", X is a model name — set model to the matching key and write a separate creative prompt.',
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
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
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
];

// ──────────────────────────────────────────────
// MCP-ONLY TOOLS (agent: false, mcp: true)
// ──────────────────────────────────────────────

const MCP_ONLY_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description: 'Check the status of a video creation job',
    name: 'get_video_status',
    parameters: {
      properties: {
        videoId: {
          description: 'The ID of the video to check',
          type: 'string',
        },
      },
      required: ['videoId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List all videos in your organization',
    name: 'list_videos',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of videos to return',
          type: 'number',
        },
        offset: {
          default: 0,
          description: 'Offset for pagination',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Get detailed analytics for a specific video',
    name: 'get_video_analytics',
    parameters: {
      properties: {
        timeRange: {
          default: '7d',
          description: 'Time range for analytics',
          enum: ['24h', '7d', '30d', '90d', 'all'],
          type: 'string',
        },
        videoId: {
          description: 'The ID of the video',
          type: 'string',
        },
      },
      required: ['videoId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Generate viral AI-powered articles with SEO optimization. Specify topic, tone, length, target audience, and keywords for maximum engagement.',
    name: 'create_article',
    parameters: {
      properties: {
        keywords: {
          description: 'SEO keywords to include',
          items: { type: 'string' },
          type: 'array',
        },
        length: {
          default: 'medium',
          description: 'Article length',
          enum: ['short', 'medium', 'long'],
          type: 'string',
        },
        targetAudience: {
          description: 'Target audience for the article',
          type: 'string',
        },
        tone: {
          default: 'professional',
          description: 'Writing tone and style',
          enum: [
            'professional',
            'casual',
            'humorous',
            'technical',
            'storytelling',
          ],
          type: 'string',
        },
        topic: {
          description: 'Article topic or main idea',
          type: 'string',
        },
      },
      required: ['topic'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Search published articles by query, category, or tags. Filter and find content quickly.',
    name: 'search_articles',
    parameters: {
      properties: {
        category: {
          description: 'Filter by category',
          type: 'string',
        },
        limit: {
          default: 10,
          description: 'Maximum results to return',
          maximum: 50,
          type: 'number',
        },
        query: {
          description: 'Search query',
          type: 'string',
        },
      },
      required: ['query'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Get a specific article by ID',
    name: 'get_article',
    parameters: {
      properties: {
        articleId: {
          description: 'The ID of the article to retrieve',
          type: 'string',
        },
      },
      required: ['articleId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List all generated images',
    name: 'list_images',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of images to return',
          type: 'number',
        },
        offset: {
          default: 0,
          description: 'Offset for pagination',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Generate AI avatars for videos, perfect for talking head videos, presentations, and content creation.',
    name: 'create_avatar',
    parameters: {
      properties: {
        age: {
          default: 'middle-aged',
          description: 'Age range',
          enum: ['young', 'middle-aged', 'senior'],
          type: 'string',
        },
        gender: {
          description: 'Avatar gender',
          enum: ['male', 'female', 'neutral'],
          type: 'string',
        },
        name: {
          description: 'Name for the avatar',
          type: 'string',
        },
        style: {
          default: 'realistic',
          description: 'Avatar style',
          enum: ['realistic', 'cartoon', 'professional', 'casual'],
          type: 'string',
        },
      },
      required: ['name'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List all available avatars',
    name: 'list_avatars',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of avatars to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List all generated music tracks',
    name: 'list_music',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of tracks to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get analytics for a specific piece of content (article, video, or image)',
    name: 'get_content_analytics',
    parameters: {
      properties: {
        contentId: {
          description: 'ID of the content',
          type: 'string',
        },
        contentType: {
          description: 'Type of content',
          enum: ['article', 'video', 'image'],
          type: 'string',
        },
        timeRange: {
          default: '7d',
          description: 'Time range for analytics',
          enum: ['24h', '7d', '30d', '90d', 'all'],
          type: 'string',
        },
      },
      required: ['contentId', 'contentType'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get detailed usage statistics including content created, credits used, and account activity',
    name: 'get_usage_stats',
    parameters: {
      properties: {
        timeRange: {
          default: '30d',
          description: 'Time range for stats',
          enum: ['today', '7d', '30d', '90d', 'all'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get the current status and progress of a workflow, including step completion details.',
    name: 'get_workflow_status',
    parameters: {
      properties: {
        workflowId: {
          description: 'ID of the workflow to check',
          type: 'string',
        },
      },
      required: ['workflowId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'List available workflow templates that can be used to quickly create new workflows.',
    name: 'list_workflow_templates',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get current account info including user, organization, scopes, and active brand',
    name: 'get_account_info',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Get details of the currently active brand',
    name: 'get_brand',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Check the status of a content generation job. Auto-detects content type.',
    name: 'get_job_status',
    parameters: {
      properties: {
        jobId: {
          description: 'The job/ingredient ID to check',
          type: 'string',
        },
      },
      required: ['jobId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get aggregated ad performance insights from the performing ads database across all connected customers',
    name: 'get_ad_performance_insights',
    parameters: {
      properties: {
        industry: {
          description: 'Filter by industry',
          type: 'string',
        },
        platform: {
          description: 'Filter by ad platform',
          enum: ['meta', 'google'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Generate ad copy variations based on top-performing patterns in the performing ads database',
    name: 'generate_ad_variations',
    parameters: {
      properties: {
        body: {
          description: 'Current ad body text to create variations of',
          type: 'string',
        },
        count: {
          default: 5,
          description: 'Number of variations to generate',
          type: 'number',
        },
        headline: {
          description: 'Current headline to create variations of',
          type: 'string',
        },
        platform: {
          description: 'Target ad platform',
          enum: ['meta', 'google'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Suggest ad headlines modeled after winning patterns from the performing ads database',
    name: 'suggest_ad_headlines',
    parameters: {
      properties: {
        industry: {
          description: 'Target industry',
          type: 'string',
        },
        platform: {
          description: 'Target ad platform',
          enum: ['meta', 'google'],
          type: 'string',
        },
        product: {
          description: 'Product or service to create headlines for',
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Compare your ad metrics against industry benchmarks from the performing ads database',
    name: 'benchmark_ad_performance',
    parameters: {
      properties: {
        industry: {
          description: 'Industry to benchmark against',
          type: 'string',
        },
        platform: {
          description: 'Ad platform to benchmark',
          enum: ['meta', 'google'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get darkroom GPU health: GPU name, VRAM, utilization, temperature, and disk usage',
    name: 'get_darkroom_health',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Control ComfyUI service: start, stop, restart, or check status. Destructive actions require confirm: true.',
    name: 'control_comfyui',
    parameters: {
      properties: {
        action: {
          description: 'Action to perform',
          enum: ['start', 'stop', 'restart', 'status'],
          type: 'string',
        },
        confirm: {
          default: false,
          description:
            'Required for stop/restart actions. Set to true to confirm.',
          type: 'boolean',
        },
      },
      required: ['action'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List LoRA models available on the GPU',
    name: 'list_loras',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List personas available on the darkroom GPU',
    name: 'list_gpu_personas',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Start a new agent conversation',
    name: 'create_chat',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Send a message in an existing agent conversation',
    name: 'send_chat_message',
    parameters: {
      properties: {
        message: {
          description: 'Message to send',
          type: 'string',
        },
        threadId: {
          description: 'The thread ID',
          type: 'string',
        },
      },
      required: ['threadId', 'message'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Generate face fidelity test images (3 configs x N prompts)',
    name: 'generate_face_test',
    parameters: {
      properties: {
        personaHandle: {
          description: 'Persona handle to test',
          type: 'string',
        },
        prompts: {
          description: 'Prompts to test with',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['personaHandle', 'prompts'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Generate N images for dataset expansion (bootstrap)',
    name: 'generate_bootstrap',
    parameters: {
      properties: {
        count: {
          default: 10,
          description: 'Number of images to generate',
          type: 'number',
        },
        personaHandle: {
          description: 'Persona handle',
          type: 'string',
        },
        prompt: {
          description: 'Generation prompt',
          type: 'string',
        },
      },
      required: ['personaHandle'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Generate PuLID face-consistent images from a LoRA',
    name: 'generate_pulid',
    parameters: {
      properties: {
        count: {
          default: 1,
          description: 'Number of images',
          type: 'number',
        },
        personaHandle: {
          description: 'Persona handle',
          type: 'string',
        },
        prompt: {
          description: 'Generation prompt',
          type: 'string',
        },
      },
      required: ['personaHandle', 'prompt'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Generate content images from a trained LoRA model',
    name: 'generate_darkroom_content',
    parameters: {
      properties: {
        count: {
          default: 1,
          description: 'Number of images',
          type: 'number',
        },
        personaHandle: {
          description: 'Persona handle',
          type: 'string',
        },
        prompt: {
          description: 'Content generation prompt',
          type: 'string',
        },
      },
      required: ['personaHandle', 'prompt'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Check the status of a darkroom generation job',
    name: 'get_darkroom_job_status',
    parameters: {
      properties: {
        jobId: {
          description: 'Darkroom job ID',
          type: 'string',
        },
      },
      required: ['jobId'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List accessible Google Ads customer accounts',
    name: 'list_google_ads_customers',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List Google Ads campaigns with optional status filter',
    name: 'list_google_ads_campaigns',
    parameters: {
      properties: {
        customerId: {
          description: 'Google Ads customer ID',
          type: 'string',
        },
        limit: {
          default: 50,
          description: 'Maximum number of campaigns',
          type: 'number',
        },
        loginCustomerId: {
          description:
            'Manager account customer ID (required when accessing client accounts via manager)',
          type: 'string',
        },
        status: {
          description: 'Filter by campaign status',
          enum: ['ENABLED', 'PAUSED', 'REMOVED'],
          type: 'string',
        },
      },
      required: ['customerId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get detailed metrics for a Google Ads campaign including impressions, clicks, cost, conversions, CTR, and CPC',
    name: 'get_google_ads_campaign_metrics',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID',
          type: 'string',
        },
        customerId: {
          description: 'Google Ads customer ID',
          type: 'string',
        },
        endDate: {
          description: 'End date (YYYY-MM-DD)',
          type: 'string',
        },
        loginCustomerId: {
          description: 'Manager account customer ID',
          type: 'string',
        },
        segmentByDate: {
          default: false,
          description: 'Break down metrics by date',
          type: 'boolean',
        },
        startDate: {
          description: 'Start date (YYYY-MM-DD)',
          type: 'string',
        },
      },
      required: ['customerId', 'campaignId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Get performance insights for a Google Ads ad group',
    name: 'get_google_ads_adgroup_insights',
    parameters: {
      properties: {
        adGroupId: {
          description: 'Ad group ID',
          type: 'string',
        },
        customerId: {
          description: 'Google Ads customer ID',
          type: 'string',
        },
        endDate: {
          description: 'End date (YYYY-MM-DD)',
          type: 'string',
        },
        loginCustomerId: {
          description: 'Manager account customer ID',
          type: 'string',
        },
        startDate: {
          description: 'Start date (YYYY-MM-DD)',
          type: 'string',
        },
      },
      required: ['customerId', 'adGroupId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get keyword performance report with quality scores, clicks, impressions, and cost',
    name: 'get_google_ads_keyword_performance',
    parameters: {
      properties: {
        customerId: {
          description: 'Google Ads customer ID',
          type: 'string',
        },
        endDate: {
          description: 'End date (YYYY-MM-DD)',
          type: 'string',
        },
        limit: {
          default: 100,
          description: 'Maximum number of keywords',
          type: 'number',
        },
        loginCustomerId: {
          description: 'Manager account customer ID',
          type: 'string',
        },
        startDate: {
          description: 'Start date (YYYY-MM-DD)',
          type: 'string',
        },
      },
      required: ['customerId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get search terms report showing actual search queries that triggered your ads',
    name: 'get_google_ads_search_terms',
    parameters: {
      properties: {
        campaignId: {
          description: 'Campaign ID to get search terms for',
          type: 'string',
        },
        customerId: {
          description: 'Google Ads customer ID',
          type: 'string',
        },
        endDate: {
          description: 'End date (YYYY-MM-DD)',
          type: 'string',
        },
        limit: {
          default: 100,
          description: 'Maximum number of search terms',
          type: 'number',
        },
        loginCustomerId: {
          description: 'Manager account customer ID',
          type: 'string',
        },
        startDate: {
          description: 'Start date (YYYY-MM-DD)',
          type: 'string',
        },
      },
      required: ['customerId', 'campaignId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List connected Meta (Facebook) ad accounts',
    name: 'list_meta_ad_accounts',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'List Meta ad campaigns with optional status filter and pagination',
    name: 'list_meta_campaigns',
    parameters: {
      properties: {
        adAccountId: {
          description: 'The ad account ID (e.g., act_123456)',
          type: 'string',
        },
        limit: {
          default: 50,
          description: 'Maximum number of campaigns to return',
          type: 'number',
        },
        status: {
          description: 'Filter by campaign status',
          enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'],
          type: 'string',
        },
      },
      required: ['adAccountId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get detailed performance insights for a Meta ad campaign including spend, impressions, clicks, CTR, CPC, CPM, and conversions',
    name: 'get_meta_campaign_insights',
    parameters: {
      properties: {
        campaignId: {
          description: 'The campaign ID',
          type: 'string',
        },
        datePreset: {
          default: 'last_30d',
          description: 'Predefined date range',
          enum: [
            'today',
            'yesterday',
            'last_7d',
            'last_14d',
            'last_30d',
            'last_90d',
          ],
          type: 'string',
        },
        since: {
          description: 'Start date (YYYY-MM-DD) for custom range',
          type: 'string',
        },
        until: {
          description: 'End date (YYYY-MM-DD) for custom range',
          type: 'string',
        },
      },
      required: ['campaignId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Get performance insights for a Meta ad set',
    name: 'get_meta_adset_insights',
    parameters: {
      properties: {
        adSetId: {
          description: 'The ad set ID',
          type: 'string',
        },
        datePreset: {
          default: 'last_30d',
          description: 'Predefined date range',
          enum: [
            'today',
            'yesterday',
            'last_7d',
            'last_14d',
            'last_30d',
            'last_90d',
          ],
          type: 'string',
        },
      },
      required: ['adSetId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get performance insights for an individual Meta ad including creative details',
    name: 'get_meta_ad_insights',
    parameters: {
      properties: {
        adId: {
          description: 'The ad ID',
          type: 'string',
        },
        datePreset: {
          default: 'last_30d',
          description: 'Predefined date range',
          enum: [
            'today',
            'yesterday',
            'last_7d',
            'last_14d',
            'last_30d',
            'last_90d',
          ],
          type: 'string',
        },
      },
      required: ['adId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'List creative assets (headlines, body text, CTAs, images) for Meta ads',
    name: 'list_meta_ad_creatives',
    parameters: {
      properties: {
        adAccountId: {
          description: 'The ad account ID',
          type: 'string',
        },
        limit: {
          default: 50,
          description: 'Maximum number of creatives to return',
          type: 'number',
        },
      },
      required: ['adAccountId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Compare performance metrics side-by-side for multiple Meta campaigns',
    name: 'compare_meta_campaigns',
    parameters: {
      properties: {
        campaignIds: {
          description: 'Comma-separated campaign IDs to compare',
          items: { type: 'string' },
          type: 'array',
        },
        datePreset: {
          default: 'last_30d',
          description: 'Predefined date range for comparison',
          enum: [
            'today',
            'yesterday',
            'last_7d',
            'last_14d',
            'last_30d',
            'last_90d',
          ],
          type: 'string',
        },
      },
      required: ['campaignIds'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get top performing Meta ads sorted by a specific metric (CTR, ROAS, CPC, etc.)',
    name: 'get_meta_top_performers',
    parameters: {
      properties: {
        adAccountId: {
          description: 'The ad account ID',
          type: 'string',
        },
        limit: {
          default: 10,
          description: 'Number of top performers to return',
          type: 'number',
        },
        metric: {
          description: 'Metric to rank by',
          enum: [
            'ctr',
            'cpc',
            'cpm',
            'spend',
            'impressions',
            'clicks',
            'conversions',
            'reach',
          ],
          type: 'string',
        },
      },
      required: ['adAccountId', 'metric'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Start LoRA training with configurable steps, rank, and learning rate',
    name: 'start_training',
    parameters: {
      properties: {
        handle: {
          description: 'Persona handle to train',
          type: 'string',
        },
        learningRate: {
          default: 0.0001,
          description: 'Learning rate',
          type: 'number',
        },
        rank: {
          default: 32,
          description: 'LoRA rank',
          type: 'number',
        },
        steps: {
          default: 1000,
          description: 'Number of training steps',
          type: 'number',
        },
      },
      required: ['handle'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Get training job progress, current stage, and estimated time',
    name: 'get_training_status',
    parameters: {
      properties: {
        jobId: {
          description: 'Training job ID',
          type: 'string',
        },
      },
      required: ['jobId'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get dataset info including image count, caption count, and file list',
    name: 'get_dataset_info',
    parameters: {
      properties: {
        handle: {
          description: 'Persona handle',
          type: 'string',
        },
      },
      required: ['handle'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Delete a training dataset. Requires confirm: true.',
    name: 'delete_dataset',
    parameters: {
      properties: {
        confirm: {
          default: false,
          description: 'Set to true to confirm deletion',
          type: 'boolean',
        },
        handle: {
          description: 'Persona handle',
          type: 'string',
        },
      },
      required: ['handle'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Run Florence-2 auto-captioning on a dataset',
    name: 'run_captioning',
    parameters: {
      properties: {
        handle: {
          description: 'Persona handle',
          type: 'string',
        },
      },
      required: ['handle'],
      type: 'object',
    },
    requiredRole: 'admin',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Generate LinkedIn-optimized post text for a given topic or brief. Returns ready-to-publish text content with hook, body, CTA, and hashtags.',
    name: 'generate_linkedin_content',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to apply tone and voice profile',
          type: 'string',
        },
        topic: {
          description:
            'Topic, brief, or sales objection to turn into LinkedIn content',
          type: 'string',
        },
        variationsCount: {
          default: 3,
          description: 'Number of content variations to generate (1-5)',
          maximum: 5,
          minimum: 1,
          type: 'number',
        },
      },
      required: ['topic'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Check whether a LinkedIn account is connected for the current user. Returns connection status, handle, and avatar if connected.',
    name: 'get_linkedin_connection_status',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get analytics for LinkedIn posts including impressions, engagement rate, reactions, comments, and shares. Requires a content ID.',
    name: 'get_linkedin_analytics',
    parameters: {
      properties: {
        contentId: {
          description: 'ID of the content to get LinkedIn analytics for',
          type: 'string',
        },
        timeRange: {
          default: '7d',
          description: 'Time range for analytics',
          enum: ['24h', '7d', '30d', '90d'],
          type: 'string',
        },
      },
      required: ['contentId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];

export const SOURCE_TOOLS: SourceTool[] = [
  ...OVERLAP_TOOLS,
  ...AGENT_ONLY_TOOLS,
  ...MCP_ONLY_TOOLS,
];
