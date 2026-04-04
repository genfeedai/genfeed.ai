export interface McpSourceTool {
  name: string;
  description: string;
  surfaces?: {
    cliAgentVisible?: boolean;
  };
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  requiredRole: 'user' | 'admin' | 'superadmin';
}

export const MCP_SOURCE_TOOLS: McpSourceTool[] = [
  {
    description:
      'Create AI-generated videos with customizable styles, duration, and voice-over. Perfect for social media, marketing, tutorials, and more.',
    inputSchema: {
      properties: {
        description: {
          description: 'Description or script for the video',
          type: 'string',
        },
        duration: {
          description: 'Target duration in seconds',
          maximum: 120,
          minimum: 10,
          type: 'number',
        },
        style: {
          description: 'Visual style for the video',
          enum: [
            'professional',
            'casual',
            'animated',
            'documentary',
            'tutorial',
          ],
          type: 'string',
        },
        title: {
          description: 'Title of the video',
          type: 'string',
        },
        voiceOver: {
          properties: {
            enabled: {
              description: 'Whether to include voice-over',
              type: 'boolean',
            },
            voice: {
              description: 'Voice type',
              enum: ['male', 'female', 'neutral'],
              type: 'string',
            },
          },
          type: 'object',
        },
      },
      required: ['title', 'description'],
      type: 'object',
    },
    name: 'generate_video',
    requiredRole: 'user',
  },
  {
    description: 'Check the status of a video creation job',
    inputSchema: {
      properties: {
        videoId: {
          description: 'The ID of the video to check',
          type: 'string',
        },
      },
      required: ['videoId'],
      type: 'object',
    },
    name: 'get_video_status',
    requiredRole: 'user',
  },
  {
    description: 'List all videos in your organization',
    inputSchema: {
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
    name: 'list_videos',
    requiredRole: 'user',
  },
  {
    description: 'Get detailed analytics for a specific video',
    inputSchema: {
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
    name: 'get_video_analytics',
    requiredRole: 'user',
  },
  {
    description:
      'Generate viral AI-powered articles with SEO optimization. Specify topic, tone, length, target audience, and keywords for maximum engagement.',
    inputSchema: {
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
    name: 'create_article',
    requiredRole: 'user',
  },
  {
    description:
      'Search published articles by query, category, or tags. Filter and find content quickly.',
    inputSchema: {
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
    name: 'search_articles',
    requiredRole: 'user',
  },
  {
    description: 'Get a specific article by ID',
    inputSchema: {
      properties: {
        articleId: {
          description: 'The ID of the article to retrieve',
          type: 'string',
        },
      },
      required: ['articleId'],
      type: 'object',
    },
    name: 'get_article',
    requiredRole: 'user',
  },
  {
    description:
      'Generate AI images with custom prompts, styles, and dimensions. Perfect for social media, blogs, and marketing materials.',
    inputSchema: {
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
    name: 'generate_image',
    requiredRole: 'user',
  },
  {
    description: 'List all generated images',
    inputSchema: {
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
    name: 'list_images',
    requiredRole: 'user',
  },
  {
    description:
      'Generate AI avatars for videos, perfect for talking head videos, presentations, and content creation.',
    inputSchema: {
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
    name: 'create_avatar',
    requiredRole: 'user',
  },
  {
    description: 'List all available avatars',
    inputSchema: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of avatars to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    name: 'list_avatars',
    requiredRole: 'user',
  },
  {
    description:
      'Generate AI music tracks for videos, podcasts, and content. Customize genre, mood, and duration.',
    inputSchema: {
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
    name: 'generate_music',
    requiredRole: 'user',
  },
  {
    description: 'List all generated music tracks',
    inputSchema: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of tracks to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    name: 'list_music',
    requiredRole: 'user',
  },
  {
    description:
      'Publish content (articles, videos, images) to social media platforms. Supports Twitter, LinkedIn, Instagram, TikTok, and YouTube.',
    inputSchema: {
      properties: {
        contentId: {
          description: 'ID of the article, video, or image to publish',
          type: 'string',
        },
        customMessage: {
          description:
            'Optional: Custom caption or message for the social post',
          type: 'string',
        },
        platforms: {
          description: 'Platforms to publish to',
          items: {
            enum: ['twitter', 'linkedin', 'instagram', 'tiktok', 'youtube'],
            type: 'string',
          },
          type: 'array',
        },
        scheduleAt: {
          description:
            'Optional: Schedule for later (ISO 8601 format). Leave empty for immediate publishing.',
          format: 'date-time',
          type: 'string',
        },
      },
      required: ['contentId', 'platforms'],
      type: 'object',
    },
    name: 'create_post',
    requiredRole: 'user',
  },
  {
    description: 'List all published content across platforms',
    inputSchema: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum results to return',
          type: 'number',
        },
        platform: {
          default: 'all',
          description: 'Filter by platform',
          enum: [
            'all',
            'twitter',
            'linkedin',
            'instagram',
            'tiktok',
            'youtube',
          ],
          type: 'string',
        },
      },
      type: 'object',
    },
    name: 'list_posts',
    requiredRole: 'user',
  },
  {
    description:
      'Get trending topics and content ideas based on current trends across social media and news.',
    inputSchema: {
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
    name: 'get_trends',
    requiredRole: 'user',
  },
  {
    description:
      'Get analytics for a specific piece of content (article, video, or image)',
    inputSchema: {
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
    name: 'get_content_analytics',
    requiredRole: 'user',
  },
  {
    description:
      'Get available credits balance and usage information for your account',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'get_credits_balance',
    requiredRole: 'user',
  },
  {
    description:
      'Get detailed usage statistics including content created, credits used, and account activity',
    inputSchema: {
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
    name: 'get_usage_stats',
    requiredRole: 'user',
  },
  {
    description:
      'Create a multi-step content workflow from a template or custom steps. Automate content creation, scheduling, and publishing.',
    inputSchema: {
      properties: {
        description: {
          description: 'Description of the workflow',
          type: 'string',
        },
        name: {
          description: 'Name for the workflow',
          type: 'string',
        },
        schedule: {
          description: 'Scheduling configuration',
          properties: {
            startAt: {
              description: 'Start date/time (ISO 8601)',
              format: 'date-time',
              type: 'string',
            },
            timezone: {
              description: 'Timezone (e.g., America/New_York)',
              type: 'string',
            },
            type: {
              description: 'Schedule frequency',
              enum: ['once', 'daily', 'weekly', 'monthly'],
              type: 'string',
            },
          },
          type: 'object',
        },
        templateId: {
          description:
            'Template ID to base the workflow on (use list_workflow_templates to see available templates)',
          type: 'string',
        },
      },
      required: ['name'],
      type: 'object',
    },
    name: 'create_workflow',
    requiredRole: 'user',
  },
  {
    description:
      'Execute an existing workflow immediately. Optionally pass variables to customize the execution.',
    inputSchema: {
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
    name: 'execute_workflow',
    requiredRole: 'user',
  },
  {
    description:
      'Get the current status and progress of a workflow, including step completion details.',
    inputSchema: {
      properties: {
        workflowId: {
          description: 'ID of the workflow to check',
          type: 'string',
        },
      },
      required: ['workflowId'],
      type: 'object',
    },
    name: 'get_workflow_status',
    requiredRole: 'user',
  },
  {
    description:
      'List all workflows in your organization with optional status filtering.',
    inputSchema: {
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
    name: 'list_workflows',
    requiredRole: 'user',
  },
  {
    description:
      'List available workflow templates that can be used to quickly create new workflows.',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'list_workflow_templates',
    requiredRole: 'user',
  },
  {
    description:
      'Get current account info including user, organization, scopes, and active brand',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'get_account_info',
    requiredRole: 'user',
  },
  {
    description: 'List all brands in the organization with active indicator',
    inputSchema: {
      properties: {
        limit: {
          default: 20,
          description: 'Maximum number of brands to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    name: 'list_brands',
    requiredRole: 'user',
  },
  {
    description: 'Get details of the currently active brand',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'get_brand',
    requiredRole: 'user',
  },
  {
    description:
      'Check the status of a content generation job. Auto-detects content type.',
    inputSchema: {
      properties: {
        jobId: {
          description: 'The job/ingredient ID to check',
          type: 'string',
        },
      },
      required: ['jobId'],
      type: 'object',
    },
    name: 'get_job_status',
    requiredRole: 'user',
  },
  {
    description:
      'Get aggregated ad performance insights from the performing ads database across all connected customers',
    inputSchema: {
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
    name: 'get_ad_performance_insights',
    requiredRole: 'user',
  },
  {
    description:
      'Generate ad copy variations based on top-performing patterns in the performing ads database',
    inputSchema: {
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
    name: 'generate_ad_variations',
    requiredRole: 'user',
  },
  {
    description:
      'Suggest ad headlines modeled after winning patterns from the performing ads database',
    inputSchema: {
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
    name: 'suggest_ad_headlines',
    requiredRole: 'user',
  },
  {
    description:
      'Compare your ad metrics against industry benchmarks from the performing ads database',
    inputSchema: {
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
    name: 'benchmark_ad_performance',
    requiredRole: 'user',
  },
  {
    description:
      'Get darkroom GPU health: GPU name, VRAM, utilization, temperature, and disk usage',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'get_darkroom_health',
    requiredRole: 'admin',
  },
  {
    description:
      'Control ComfyUI service: start, stop, restart, or check status. Destructive actions require confirm: true.',
    inputSchema: {
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
    name: 'control_comfyui',
    requiredRole: 'admin',
  },
  {
    description: 'List LoRA models available on the GPU',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'list_loras',
    requiredRole: 'admin',
  },
  {
    description: 'List personas available on the darkroom GPU',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'list_gpu_personas',
    requiredRole: 'admin',
  },
  {
    description: 'Start a new agent conversation',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'create_chat',
    requiredRole: 'user',
  },
  {
    description: 'Send a message in an existing agent conversation',
    inputSchema: {
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
    name: 'send_chat_message',
    requiredRole: 'user',
  },
  {
    description: 'Generate face fidelity test images (3 configs x N prompts)',
    inputSchema: {
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
    name: 'generate_face_test',
    requiredRole: 'admin',
  },
  {
    description: 'Generate N images for dataset expansion (bootstrap)',
    inputSchema: {
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
    name: 'generate_bootstrap',
    requiredRole: 'admin',
  },
  {
    description: 'Generate PuLID face-consistent images from a LoRA',
    inputSchema: {
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
    name: 'generate_pulid',
    requiredRole: 'admin',
  },
  {
    description: 'Generate content images from a trained LoRA model',
    inputSchema: {
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
    name: 'generate_darkroom_content',
    requiredRole: 'admin',
  },
  {
    description: 'Check the status of a darkroom generation job',
    inputSchema: {
      properties: {
        jobId: {
          description: 'Darkroom job ID',
          type: 'string',
        },
      },
      required: ['jobId'],
      type: 'object',
    },
    name: 'get_darkroom_job_status',
    requiredRole: 'admin',
  },
  {
    description: 'List accessible Google Ads customer accounts',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'list_google_ads_customers',
    requiredRole: 'user',
  },
  {
    description: 'List Google Ads campaigns with optional status filter',
    inputSchema: {
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
    name: 'list_google_ads_campaigns',
    requiredRole: 'user',
  },
  {
    description:
      'Get detailed metrics for a Google Ads campaign including impressions, clicks, cost, conversions, CTR, and CPC',
    inputSchema: {
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
    name: 'get_google_ads_campaign_metrics',
    requiredRole: 'user',
  },
  {
    description: 'Get performance insights for a Google Ads ad group',
    inputSchema: {
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
    name: 'get_google_ads_adgroup_insights',
    requiredRole: 'user',
  },
  {
    description:
      'Get keyword performance report with quality scores, clicks, impressions, and cost',
    inputSchema: {
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
    name: 'get_google_ads_keyword_performance',
    requiredRole: 'user',
  },
  {
    description:
      'Get search terms report showing actual search queries that triggered your ads',
    inputSchema: {
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
    name: 'get_google_ads_search_terms',
    requiredRole: 'user',
  },
  {
    description: 'List connected Meta (Facebook) ad accounts',
    inputSchema: {
      properties: {},
      type: 'object',
    },
    name: 'list_meta_ad_accounts',
    requiredRole: 'user',
  },
  {
    description:
      'List Meta ad campaigns with optional status filter and pagination',
    inputSchema: {
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
    name: 'list_meta_campaigns',
    requiredRole: 'user',
  },
  {
    description:
      'Get detailed performance insights for a Meta ad campaign including spend, impressions, clicks, CTR, CPC, CPM, and conversions',
    inputSchema: {
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
    name: 'get_meta_campaign_insights',
    requiredRole: 'user',
  },
  {
    description: 'Get performance insights for a Meta ad set',
    inputSchema: {
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
    name: 'get_meta_adset_insights',
    requiredRole: 'user',
  },
  {
    description:
      'Get performance insights for an individual Meta ad including creative details',
    inputSchema: {
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
    name: 'get_meta_ad_insights',
    requiredRole: 'user',
  },
  {
    description:
      'List creative assets (headlines, body text, CTAs, images) for Meta ads',
    inputSchema: {
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
    name: 'list_meta_ad_creatives',
    requiredRole: 'user',
  },
  {
    description:
      'Compare performance metrics side-by-side for multiple Meta campaigns',
    inputSchema: {
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
    name: 'compare_meta_campaigns',
    requiredRole: 'user',
  },
  {
    description:
      'Get top performing Meta ads sorted by a specific metric (CTR, ROAS, CPC, etc.)',
    inputSchema: {
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
    name: 'get_meta_top_performers',
    requiredRole: 'user',
  },
  {
    description:
      'Start LoRA training with configurable steps, rank, and learning rate',
    inputSchema: {
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
    name: 'start_training',
    requiredRole: 'admin',
  },
  {
    description: 'Get training job progress, current stage, and estimated time',
    inputSchema: {
      properties: {
        jobId: {
          description: 'Training job ID',
          type: 'string',
        },
      },
      required: ['jobId'],
      type: 'object',
    },
    name: 'get_training_status',
    requiredRole: 'admin',
  },
  {
    description:
      'Get dataset info including image count, caption count, and file list',
    inputSchema: {
      properties: {
        handle: {
          description: 'Persona handle',
          type: 'string',
        },
      },
      required: ['handle'],
      type: 'object',
    },
    name: 'get_dataset_info',
    requiredRole: 'admin',
  },
  {
    description: 'Delete a training dataset. Requires confirm: true.',
    inputSchema: {
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
    name: 'delete_dataset',
    requiredRole: 'admin',
  },
  {
    description: 'Run Florence-2 auto-captioning on a dataset',
    inputSchema: {
      properties: {
        handle: {
          description: 'Persona handle',
          type: 'string',
        },
      },
      required: ['handle'],
      type: 'object',
    },
    name: 'run_captioning',
    requiredRole: 'admin',
  },
];
