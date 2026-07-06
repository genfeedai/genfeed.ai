import type { SourceTool } from '../../interfaces/source-tool.interface.js';
import { OVERLAP_GENERATION_TOOLS } from './overlap-generation.tools.js';
import { WORKFLOW_CONTROL_TOOLS } from './workflow-control.tools.js';

export const OVERLAP_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
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
  {
    // Minimum charge per call (standard image; 4k costs more). Actual amount
    // is billed dynamically by the generation endpoint (issue #482).
    creditCost: 50,
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
  {
    // Minimum charge per call (cheapest music model). Actual amount is billed
    // dynamically by the generation endpoint per model cost (issue #482).
    creditCost: 10,
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
  {
    // Minimum charge per call (shortest 4s clip). Actual amount is billed
    // dynamically by the generation endpoint per duration (issue #482).
    creditCost: 300,
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
  ...OVERLAP_GENERATION_TOOLS,
  ...WORKFLOW_CONTROL_TOOLS,
];
