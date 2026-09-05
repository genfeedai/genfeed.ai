import type { SourceTool } from '../../../interfaces/source-tool.interface';

// Hoisted so both `anyOf` branches close over the identical property set: the
// engine compiles action contracts in strict mode, where every object branch
// must define the properties it requires and set `additionalProperties`.
const SUGGEST_NEXT_STEP_PROPERTIES = {
  description: {
    description: 'One-line explanation of what this step does.',
    type: 'string',
  },
  destination: {
    description:
      'Page that owns this step. Omit when the step is only actionable inside the conversation.',
    enum: [
      'agent',
      'analytics',
      'billing',
      'brand_settings',
      'calendar',
      'connect_accounts',
      'credits',
      'library',
      'members',
      'models',
      'posts',
      'provider_keys',
      'publishing_settings',
      'review_queue',
      'settings',
      'studio',
      'workflows',
    ],
    type: 'string',
  },
  prompt: {
    description:
      'Message to send back into this conversation when the user chooses to do it here. Omit when the step can only be completed on its page.',
    type: 'string',
  },
  title: {
    description: 'Short label for the step, e.g. "Brand setup".',
    type: 'string',
  },
} as const;

export const AGENT_UI_TOOLS: SourceTool[] = [
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
            'UI blocks to render. Each block must have id (string), type (metric_card|kpi_grid|chart|table|top_posts|alert|section_header|text_paragraph|bullet_list|callout|image_grid|composite|empty_state), and optional width (full|half|third). Chart blocks need chartType (area|bar|line|pie), data array, and optional xAxis/series. Table blocks need columns and rows arrays. KPI grid blocks need a cards array of metric_card blocks.',
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
                anyOf: [
                  { items: { type: 'object' }, type: 'array' },
                  { type: 'number' },
                ],
                description:
                  'Table columns: [{ key, label, sortable?, align? }] or number of columns for kpi_grid/image_grid',
              },
              text: {
                description: 'Text for section_header or text_paragraph',
                type: 'string',
              },
              level: {
                description: 'Heading level for section_header',
                enum: [1, 2, 3, 4],
                type: 'number',
              },
              items: {
                description: 'Text items for bullet_list',
                items: { type: 'string' },
                type: 'array',
              },
              ordered: {
                description: 'Number the bullet_list items',
                type: 'boolean',
              },
              tone: {
                description: 'Callout tone',
                enum: ['info', 'warning', 'error', 'success'],
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
                description: 'Text message (for alert/empty_state/callout)',
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
                  'section_header',
                  'text_paragraph',
                  'bullet_list',
                  'callout',
                  'image_grid',
                  'composite',
                  'empty_state',
                ],
                type: 'string',
              },
              value: {
                anyOf: [{ type: 'string' }, { type: 'number' }],
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
  },
  {
    creditCost: 0,
    description:
      'Prepare a voice generate/clone card. Use this when the user asks to generate audio, a voiceover, or clone a voice. Surfaces cloned org voices, then the platform catalog when the library is empty. Always returns a card — even if both lists are empty. Do not ask the user to open Library → Voices first.',
    name: 'prepare_voice_clone',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
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
  },
  {
    creditCost: 0,
    description:
      'Prepare an image or video generation and return an interactive action card so the user can review and adjust parameters (model, aspect ratio, duration, prompt) before generating. Always use this instead of generate_image or generate_video when it is in the tool schema, including simple requests like "generate a cat image". Never call generate_image, generate_video, or a vendor-prefixed name such as default_api.generate_image. A thread is image or video, not both — if this conversation already prepared the other type, tell the user to start a new chat instead of calling this tool.',
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
            'Suggested model key in "provider/model-name" format (optional — if omitted, the card will let the user pick). Image models: google/imagen-4, google/imagen-4-ultra, google/imagen-4-fast, google/nano-banana-2-lite, google/nano-banana-2, google/nano-banana-pro, google/nano-banana, black-forest-labs/flux-2-pro, black-forest-labs/flux-2-max, black-forest-labs/flux-1.1-pro, black-forest-labs/flux-schnell, black-forest-labs/flux-kontext-pro, black-forest-labs/flux-kontext-max, ideogram-ai/ideogram-v3-quality, ideogram-ai/ideogram-v3-balanced, ideogram-ai/ideogram-v3-turbo, bytedance/seedream-4.5, bytedance/seedream-4, bytedance/seedream-5-lite, openai/gpt-image-1.5, openai/gpt-image-2, recraft-ai/recraft-v4, recraft-ai/recraft-v4-pro, xai/grok-imagine-image, runwayml/gen4-image-turbo, qwen/qwen-image. Video models: minimax/h3, google/veo-3.1, google/veo-3.1-lite, google/veo-3, google/veo-2, bytedance/seedance-2.0, bytedance/seedance-2.0-fast, kwaivgi/kling-v3-video, kwaivgi/kling-v2.6, kwaivgi/kling-v2.1, kwaivgi/kling-o1, pixverse/pixverse-v6, xai/grok-imagine-video, runwayml/gen-4.5, minimax/hailuo-2.3, minimax/hailuo-2.3-fast, vidu/q3-pro, vidu/q3-turbo, wan-video/wan-2.7-t2v, openai/sora-2. If the user says "use X" or "with X", X is a model name — set model to the matching key and write a separate creative prompt.',
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
  },
  {
    creditCost: 0,
    description:
      'Render the choices you are offering the user as an in-product card. Call this instead of listing options as numbered prose: each option becomes a button that opens the owning page and/or continues the task in this conversation. Destinations are server-owned — pick a destination key, never write a URL.',
    name: 'suggest_next_steps',
    parameters: {
      properties: {
        prompt: {
          description:
            'Optional lead-in shown above the options, e.g. "Where would you like to start?"',
          type: 'string',
        },
        steps: {
          description:
            'The offered choices, in the order they should be presented. Every step must carry a destination and/or a prompt — a title alone is not actionable and fails the whole call.',
          items: {
            additionalProperties: false,
            // A title alone is not actionable, so a step must carry at least
            // one of the two ways to act on it. Ajv's strictRequired needs each
            // branch to declare the property it requires, hence the repeat.
            anyOf: [
              {
                additionalProperties: false,
                properties: SUGGEST_NEXT_STEP_PROPERTIES,
                required: ['destination'],
              },
              {
                additionalProperties: false,
                properties: SUGGEST_NEXT_STEP_PROPERTIES,
                required: ['prompt'],
              },
            ],
            properties: SUGGEST_NEXT_STEP_PROPERTIES,
            required: ['title'],
            type: 'object',
          },
          type: 'array',
        },
      },
      required: ['steps'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
