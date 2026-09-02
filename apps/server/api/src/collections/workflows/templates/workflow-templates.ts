import { CONTENT_LOOP_TEMPLATE } from '@api/collections/workflows/templates/content-loop.template';
import { DAILY_TRENDS_DIGEST_TEMPLATE } from '@api/collections/workflows/templates/daily-trends-digest.template';
import { GENERATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/generation-templates';
import { PRODUCTIZED_DAILY_ROUTINE_TEMPLATES } from '@api/collections/workflows/templates/productized-routines.template';
import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import { WEEKLY_BRAND_CONTENT_WORKFLOW_TEMPLATE } from '@api/collections/workflows/templates/weekly-brand-content-workflow.template';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';

export type RoutineReviewDefaults = {
  autoApproveIfNoResponse: boolean;
  notifyChannels: string[];
  requireApproval: boolean;
  reviewState: 'pending_approval';
  timeoutHours: number;
};

export type RoutineTrackingTask = {
  description: string;
  key: string;
  outputType: 'newsletter' | 'post';
  priority: 'critical' | 'high' | 'low' | 'medium';
  reviewState: 'pending_approval';
  status: 'in_review' | 'todo';
  title: string;
};

export type RoutineOutputDestination = {
  key: string;
  label: string;
  required: boolean;
  type: 'email' | 'social_publish' | 'task' | 'workflow_output';
};

export type ProductizedRoutineMetadata = {
  cadence: 'daily';
  inputContract: Array<{
    defaultValue?: unknown;
    description?: string;
    key: string;
    label: string;
    required: boolean;
    type: 'boolean' | 'number' | 'select' | 'text';
  }>;
  kind: 'productized-daily-routine';
  outputDestinations: RoutineOutputDestination[];
  parentIssue: number;
  recommendedSkills: string[];
  requiredSkills: string[];
  reviewDefaults: RoutineReviewDefaults;
  sourceIssue: number;
  trackingTasks: RoutineTrackingTask[];
  version: number;
};

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  changeSummary?: string;
  icon?: string;
  isScheduleEnabled?: boolean;
  inputVariables?: Array<{
    key: string;
    type: string;
    label: string;
    description?: string;
    defaultValue?: unknown;
    required?: boolean;
    validation?: Record<string, unknown>;
  }>;
  routine?: ProductizedRoutineMetadata;
  schedule?: string;
  nodes?: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: {
      label: string;
      config: Record<string, unknown>;
      inputVariableKeys?: string[];
    };
  }>;
  edges?: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
  timezone?: string;
  version?: number;
}

export const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  ...GENERATION_WORKFLOW_TEMPLATES,
  ...Object.fromEntries(
    PRODUCTIZED_DAILY_ROUTINE_TEMPLATES.map((template) => [
      template.id,
      template,
    ]),
  ),
  'content-loop': CONTENT_LOOP_TEMPLATE,
  'daily-trends-digest': DAILY_TRENDS_DIGEST_TEMPLATE,
  'weekly-brand-ai-content-loop': WEEKLY_BRAND_CONTENT_WORKFLOW_TEMPLATE,
  'instagram-remix-review': {
    category: 'social',
    description:
      'Generate an original Instagram Reel from abstract public inspiration signals and pause for human review.',
    edges: [
      {
        id: 'edge-instagram-remix-review',
        source: 'generate-instagram-remix',
        sourceHandle: 'video',
        target: 'review-instagram-remix',
        targetHandle: 'media',
      },
    ],
    icon: 'sparkles',
    id: 'instagram-remix-review',
    isScheduleEnabled: false,
    name: 'Instagram Remix And Review',
    nodes: [
      createTemplateActionNode('videoGen', {
        data: {
          config: {
            aspectRatio: '9:16',
            duration: 8,
            model: 'kling-v2',
          },
          label: 'Generate Original Reel',
        },
        id: 'generate-instagram-remix',
        position: { x: 80, y: 120 },
      }),
      {
        data: {
          config: {
            autoApproveIfNoResponse: false,
            notifyChannels: ['task-inbox'],
            requireApproval: true,
            timeoutHours: 24,
          },
          label: 'Review Remix',
        },
        id: 'review-instagram-remix',
        position: { x: 360, y: 120 },
        type: 'reviewGate',
      },
    ],
  },
  'launch-kit': {
    category: 'launch',
    description:
      'Turn a product summary into channel-conform launch copy for Hacker News (Show HN) or Product Hunt, plus a launch-day checklist, held for human review. Generates copy only — it never posts.',
    icon: 'rocket',
    id: 'launch-kit',
    inputVariables: [
      {
        defaultValue: '',
        description: 'Name of the product or project being launched.',
        key: 'productName',
        label: 'Product Name',
        required: true,
        type: 'text',
      },
      {
        defaultValue: 'hacker_news',
        description: 'Launch channel: hacker_news or product_hunt.',
        key: 'channel',
        label: 'Channel',
        required: true,
        type: 'select',
      },
      {
        defaultValue: '',
        description: 'Plain-language description of what the product does.',
        key: 'description',
        label: 'Description',
        required: true,
        type: 'text',
      },
    ],
    name: 'Launch Kit',
    nodes: [
      {
        data: {
          config: {
            inputName: 'productName',
            inputType: 'text',
            required: true,
          },
          label: 'Product Name',
        },
        id: 'workflow-input-product-name',
        position: { x: 0, y: 40 },
        type: 'workflowInput',
      },
      {
        data: {
          config: {
            inputName: 'channel',
            inputType: 'text',
            required: true,
          },
          label: 'Channel',
        },
        id: 'workflow-input-channel',
        position: { x: 0, y: 180 },
        type: 'workflowInput',
      },
      {
        data: {
          config: {
            inputName: 'description',
            inputType: 'text',
            required: true,
          },
          label: 'Description',
        },
        id: 'workflow-input-description',
        position: { x: 0, y: 320 },
        type: 'workflowInput',
      },
      createTemplateActionNode('promptConstructor', {
        data: {
          config: {
            template:
              'Create a launch kit for {{productName}} on the {{channel}} channel (hacker_news or product_hunt). What it does: {{description}}.\n\nProduce channel-conform copy. For hacker_news: a title formatted "Show HN: <name> - <plain factual description>" (max 80 chars, no marketing adjectives, no emoji) and an honest maker first comment. For product_hunt: 3-5 tagline variants (max 60 chars each, benefit-led, no trailing period) and a maker first comment.\n\nAlso produce a launch-day checklist: finalize the copy, schedule the post for the optimal time (Product Hunt 12:01am PT; Show HN a weekday morning ET), reply to every comment within 30 minutes for the first two hours, cross-post to dev.to and owned channels, and thank early supporters.\n\nDo not post anything anywhere. Return the copy and checklist for human review.',
            variables: {},
          },
          label: 'Build Launch Prompt',
        },
        id: 'prompt-constructor-launch-kit',
        position: { x: 360, y: 180 },
      }),
      createTemplateActionNode('llm', {
        data: {
          config: {
            maxTokens: 1400,
            model: LLM_DEFAULTS.fastText,
            temperature: 0.8,
          },
          label: 'Draft Launch Assets',
        },
        id: 'llm-launch-assets',
        position: { x: 720, y: 180 },
      }),
      {
        data: {
          config: {
            autoApproveIfNoResponse: false,
            notifyChannels: ['task-inbox'],
            requireApproval: true,
            reviewState: 'pending_approval',
            timeoutHours: 24,
          },
          label: 'Review Launch Assets',
        },
        id: 'review-launch-assets',
        position: { x: 1080, y: 180 },
        type: 'reviewGate',
      },
      createTemplateActionNode('workflow.collect-output', {
        data: {
          config: {
            outputName: 'launchKit',
          },
          label: 'Launch Kit Output',
        },
        id: 'workflow-output-launch-kit',
        position: { x: 1440, y: 180 },
      }),
    ],
    edges: [
      {
        id: 'edge-product-name-to-prompt',
        source: 'workflow-input-product-name',
        sourceHandle: 'value',
        target: 'prompt-constructor-launch-kit',
        targetHandle: 'productName',
      },
      {
        id: 'edge-channel-to-prompt',
        source: 'workflow-input-channel',
        sourceHandle: 'value',
        target: 'prompt-constructor-launch-kit',
        targetHandle: 'channel',
      },
      {
        id: 'edge-description-to-prompt',
        source: 'workflow-input-description',
        sourceHandle: 'value',
        target: 'prompt-constructor-launch-kit',
        targetHandle: 'description',
      },
      {
        id: 'edge-prompt-to-llm',
        source: 'prompt-constructor-launch-kit',
        sourceHandle: 'prompt',
        target: 'llm-launch-assets',
        targetHandle: 'prompt',
      },
      {
        id: 'edge-llm-to-review',
        source: 'llm-launch-assets',
        sourceHandle: 'text',
        target: 'review-launch-assets',
        targetHandle: 'caption',
      },
      {
        id: 'edge-review-to-output',
        source: 'review-launch-assets',
        sourceHandle: 'caption',
        target: 'workflow-output-launch-kit',
        targetHandle: 'value',
      },
    ],
  },
  'ad-remix-review': {
    category: 'ads',
    description:
      'Inspect a winning ad, adapt the angle to your brand, draft an ad pack, and prepare a paused campaign for human review.',
    icon: 'megaphone',
    id: 'ad-remix-review',
    inputVariables: [
      {
        defaultValue: '',
        key: 'brandName',
        label: 'Brand Name',
        required: true,
        type: 'text',
      },
      {
        defaultValue: '',
        key: 'industry',
        label: 'Industry / Niche',
        required: true,
        type: 'text',
      },
      {
        defaultValue: '',
        key: 'objective',
        label: 'Campaign Objective',
        required: true,
        type: 'text',
      },
      {
        defaultValue: '',
        key: 'sourceHeadline',
        label: 'Source Headline',
        required: false,
        type: 'text',
      },
      {
        defaultValue: '',
        key: 'sourceBody',
        label: 'Source Body',
        required: false,
        type: 'text',
      },
      {
        defaultValue: '',
        key: 'sourceCta',
        label: 'Source CTA',
        required: false,
        type: 'text',
      },
    ],
    name: 'Ad Remix And Review',
    nodes: [
      {
        data: {
          config: {
            inputName: 'brandName',
            inputType: 'text',
            required: true,
          },
          label: 'Brand Name',
        },
        id: 'workflow-input-brand-name',
        position: { x: 0, y: 40 },
        type: 'workflowInput',
      },
      {
        data: {
          config: {
            inputName: 'industry',
            inputType: 'text',
            required: true,
          },
          label: 'Niche',
        },
        id: 'workflow-input-industry',
        position: { x: 0, y: 180 },
        type: 'workflowInput',
      },
      {
        data: {
          config: {
            inputName: 'objective',
            inputType: 'text',
            required: true,
          },
          label: 'Objective',
        },
        id: 'workflow-input-objective',
        position: { x: 0, y: 320 },
        type: 'workflowInput',
      },
      createTemplateActionNode('promptConstructor', {
        data: {
          config: {
            template:
              'Analyze the source ad angle. Preserve the conversion mechanics, simplify the promise, adapt the offer to {{brandName}}, and rewrite it for a {{industry}} audience with a {{objective}} objective. Use the source signals as inspiration, not as copy.',
            variables: {},
          },
          label: 'Pattern Extraction',
        },
        id: 'ai-prompt-constructor-ad-pattern',
        position: { x: 320, y: 180 },
      }),
      createTemplateActionNode('workflow.collect-output', {
        data: {
          config: {
            outputName: 'adPack',
          },
          label: 'Ad Pack Output',
        },
        id: 'workflow-output-ad-pack',
        position: { x: 720, y: 120 },
      }),
      createTemplateActionNode('workflow.collect-output', {
        data: {
          config: {
            outputName: 'launchPrep',
          },
          label: 'Launch Prep Output',
        },
        id: 'workflow-output-launch-prep',
        position: { x: 720, y: 280 },
      }),
    ],
  },
  'content-clips': {
    category: 'editing',
    description: 'Generate multiple short clips from a longer video',
    icon: 'cut',
    id: 'content-clips',
    name: 'Create Content Clips',
    nodes: [
      {
        id: 'create-clips',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Generate Clips',
          config: {
            actionId: 'generate_clips',
            parameters: {
              mode: 'raw-cut',
            },
          },
        },
      },
      {
        id: 'add-clip-captions',
        type: 'genfeedAction',
        position: { x: 280, y: 0 },
        data: {
          label: 'Add Captions to Clips',
          config: {
            actionId: 'effect-captions',
            parameters: {
              autoSync: true,
              style: 'dynamic',
            },
          },
        },
      },
      {
        id: 'resize-clips',
        type: 'genfeedAction',
        position: { x: 560, y: 0 },
        data: {
          label: 'Resize for Social',
          config: {
            actionId: 'process-resize',
            parameters: {
              aspectRatio: '9:16',
              maintainQuality: true,
            },
          },
        },
      },
    ],
    edges: [
      {
        id: 'create-clips' + '-' + 'add-clip-captions',
        source: 'create-clips',
        target: 'add-clip-captions',
      },
      {
        id: 'add-clip-captions' + '-' + 'resize-clips',
        source: 'add-clip-captions',
        target: 'resize-clips',
      },
    ],
  },
  'multi-platform-resize': {
    category: 'batch',
    description: 'Create multiple versions for different social platforms',
    icon: 'resize',
    id: 'multi-platform-resize',
    name: 'Multi-Platform Resize',
    nodes: [
      {
        id: 'resize-square',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Square for Instagram',
          config: {
            actionId: 'process-resize',
            parameters: {
              aspectRatio: '1:1',
              height: 1080,
              platform: 'instagram',
              width: 1080,
            },
          },
        },
      },
      {
        id: 'resize-portrait',
        type: 'genfeedAction',
        position: { x: 280, y: 0 },
        data: {
          label: 'Portrait for TikTok',
          config: {
            actionId: 'process-resize',
            parameters: {
              aspectRatio: '9:16',
              height: 1920,
              platform: 'tiktok',
              width: 1080,
            },
          },
        },
      },
      {
        id: 'resize-landscape',
        type: 'genfeedAction',
        position: { x: 560, y: 0 },
        data: {
          label: 'Landscape for YouTube',
          config: {
            actionId: 'process-resize',
            parameters: {
              aspectRatio: '16:9',
              height: 1080,
              platform: 'youtube',
              width: 1920,
            },
          },
        },
      },
      {
        id: 'resize-twitter',
        type: 'genfeedAction',
        position: { x: 840, y: 0 },
        data: {
          label: 'Twitter Format',
          config: {
            actionId: 'process-resize',
            parameters: {
              aspectRatio: '16:9',
              height: 720,
              platform: 'twitter',
              width: 1280,
            },
          },
        },
      },
    ],
    edges: [],
  },
  'social-media-publish': {
    category: 'social',
    description: 'Transform, upscale and publish to TikTok & Instagram',
    icon: 'share',
    id: 'social-media-publish',
    name: 'Publish to Social Media',
    nodes: [
      {
        id: 'transform-portrait',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Transform to Portrait',
          config: {
            actionId: 'process-transform',
            parameters: {
              aspectRatio: '9:16',
              maintainQuality: true,
              orientation: 'portrait',
            },
          },
        },
      },
      {
        id: 'upscale-1080',
        type: 'genfeedAction',
        position: { x: 280, y: 0 },
        data: {
          label: 'Upscale to 1080p',
          config: {
            actionId: 'upscale',
            parameters: {
              fps: 30,
              quality: 'high',
              resolution: '1080p',
            },
          },
        },
      },
      {
        id: 'add-captions',
        type: 'genfeedAction',
        position: { x: 560, y: 0 },
        data: {
          label: 'Add Captions',
          config: {
            actionId: 'effect-captions',
            parameters: {
              backgroundColor: 'rgba(0,0,0,0.7)',
              fontColor: '#FFFFFF',
              fontSize: 'medium',
              position: 'bottom',
              style: 'minimal',
            },
          },
        },
      },
      {
        id: 'publish-social',
        type: 'genfeedAction',
        position: { x: 840, y: 0 },
        data: {
          label: 'Publish to Platforms',
          config: {
            actionId: 'publish',
            parameters: {
              addWatermark: false,
              platforms: ['tiktok', 'instagram'],
              schedule: 'immediate',
            },
          },
        },
      },
    ],
    edges: [
      {
        id: 'transform-portrait' + '-' + 'upscale-1080',
        source: 'transform-portrait',
        target: 'upscale-1080',
      },
      {
        id: 'upscale-1080' + '-' + 'add-captions',
        source: 'upscale-1080',
        target: 'add-captions',
      },
      {
        id: 'add-captions' + '-' + 'publish-social',
        source: 'add-captions',
        target: 'publish-social',
      },
    ],
  },
  'webhook-notification': {
    category: 'integration',
    description: 'Process content and send webhook notification',
    icon: 'webhook',
    id: 'webhook-notification',
    name: 'Process and Notify',
    nodes: [
      {
        id: 'process-video',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Process Video',
          config: {
            actionId: 'upscale',
            parameters: {
              quality: 'high',
              resolution: '1080p',
            },
          },
        },
      },
      {
        id: 'notify-webhook',
        type: 'genfeedAction',
        position: { x: 280, y: 0 },
        data: {
          label: 'Send Webhook',
          config: {
            actionId: 'output-webhook',
            parameters: {
              headers: {
                'Content-Type': 'application/json',
              },
              includeAssetUrl: true,
              includeMetadata: true,
              method: 'POST',
              // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
              url: '${GENFEEDAI_WEBHOOKS_URL}',
            },
          },
        },
      },
    ],
    edges: [
      {
        id: 'process-video' + '-' + 'notify-webhook',
        source: 'process-video',
        target: 'notify-webhook',
      },
    ],
  },
  'youtube-optimization': {
    category: 'video',
    description: 'Optimize video for YouTube with 4K upscaling and chapters',
    icon: 'youtube',
    id: 'youtube-optimization',
    name: 'YouTube Optimization',
    nodes: [
      {
        id: 'transform-landscape',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Transform to Landscape',
          config: {
            actionId: 'process-transform',
            parameters: {
              aspectRatio: '16:9',
              maintainQuality: true,
              orientation: 'landscape',
            },
          },
        },
      },
      {
        id: 'upscale-4k',
        type: 'genfeedAction',
        position: { x: 280, y: 0 },
        data: {
          label: 'Upscale to 4K',
          config: {
            actionId: 'upscale',
            parameters: {
              bitrate: 'high',
              fps: 60,
              quality: 'maximum',
              resolution: '4k',
            },
          },
        },
      },
      {
        id: 'add-youtube-captions',
        type: 'genfeedAction',
        position: { x: 560, y: 0 },
        data: {
          label: 'Add YouTube Captions',
          config: {
            actionId: 'effect-captions',
            parameters: {
              generateChapters: true,
              generateTranscript: true,
              languages: ['en', 'es', 'fr'],
              style: 'youtube',
            },
          },
        },
      },
      {
        id: 'publish-youtube',
        type: 'genfeedAction',
        position: { x: 840, y: 0 },
        data: {
          label: 'Publish to YouTube',
          config: {
            actionId: 'publish',
            parameters: {
              category: 'entertainment',
              monetization: true,
              platforms: ['youtube'],
              visibility: 'public',
            },
          },
        },
      },
    ],
    edges: [
      {
        id: 'transform-landscape' + '-' + 'upscale-4k',
        source: 'transform-landscape',
        target: 'upscale-4k',
      },
      {
        id: 'upscale-4k' + '-' + 'add-youtube-captions',
        source: 'upscale-4k',
        target: 'add-youtube-captions',
      },
      {
        id: 'add-youtube-captions' + '-' + 'publish-youtube',
        source: 'add-youtube-captions',
        target: 'publish-youtube',
      },
    ],
  },
};
