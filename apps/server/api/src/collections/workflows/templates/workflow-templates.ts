import { CONTENT_LOOP_TEMPLATE } from '@api/collections/workflows/templates/content-loop.template';
import { DAILY_PUBLISHING_TEMPLATE } from '@api/collections/workflows/templates/daily-publishing-workflow.template';
import { DAILY_TRENDS_DIGEST_TEMPLATE } from '@api/collections/workflows/templates/daily-trends-digest.template';
import { DYNAMIC_VIDEO_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/dynamic-video-workflows.template';
import { GENERATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/generation-templates';
import { PRODUCTIZED_DAILY_ROUTINE_TEMPLATES } from '@api/collections/workflows/templates/productized-routines.template';
import { RESEARCH_TO_CONTENT_WORKFLOW_TEMPLATE } from '@api/collections/workflows/templates/research-to-content-workflow.template';
import { SOURCE_MAINTENANCE_WORKFLOW_TEMPLATE } from '@api/collections/workflows/templates/source-maintenance-workflow.template';
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
  ...DYNAMIC_VIDEO_WORKFLOW_TEMPLATES,
  ...Object.fromEntries(
    PRODUCTIZED_DAILY_ROUTINE_TEMPLATES.map((template) => [
      template.id,
      template,
    ]),
  ),
  'daily-brand-social-publishing': DAILY_PUBLISHING_TEMPLATE,
  'content-loop': CONTENT_LOOP_TEMPLATE,
  'daily-trends-digest': DAILY_TRENDS_DIGEST_TEMPLATE,
  'weekly-brand-ai-content-loop': WEEKLY_BRAND_CONTENT_WORKFLOW_TEMPLATE,
  'research-to-content': RESEARCH_TO_CONTENT_WORKFLOW_TEMPLATE,
  'source-maintenance': SOURCE_MAINTENANCE_WORKFLOW_TEMPLATE,
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
  'multi-platform-resize': {
    category: 'batch',
    description:
      'Reframe one video or image into square, portrait and landscape versions for each social platform',
    edges: [
      {
        id: 'edge-media-reframe-square',
        source: 'workflow-input-media',
        sourceHandle: 'value',
        target: 'reframe-square',
        targetHandle: 'media',
      },
      {
        id: 'edge-reframe-square-output',
        source: 'reframe-square',
        sourceHandle: 'mediaUrl',
        target: 'workflow-output-square',
        targetHandle: 'value',
      },
      {
        id: 'edge-media-reframe-portrait',
        source: 'workflow-input-media',
        sourceHandle: 'value',
        target: 'reframe-portrait',
        targetHandle: 'media',
      },
      {
        id: 'edge-reframe-portrait-output',
        source: 'reframe-portrait',
        sourceHandle: 'mediaUrl',
        target: 'workflow-output-portrait',
        targetHandle: 'value',
      },
      {
        id: 'edge-media-reframe-landscape',
        source: 'workflow-input-media',
        sourceHandle: 'value',
        target: 'reframe-landscape',
        targetHandle: 'media',
      },
      {
        id: 'edge-reframe-landscape-output',
        source: 'reframe-landscape',
        sourceHandle: 'mediaUrl',
        target: 'workflow-output-landscape',
        targetHandle: 'value',
      },
    ],
    icon: 'resize',
    id: 'multi-platform-resize',
    inputVariables: [
      {
        description: 'Library video or image to reframe for every platform.',
        key: 'media',
        label: 'Source Media',
        required: true,
        type: 'video',
      },
    ],
    name: 'Multi-Platform Resize',
    nodes: [
      {
        data: {
          config: {
            inputName: 'media',
            inputType: 'video',
            required: true,
          },
          label: 'Source Media',
        },
        id: 'workflow-input-media',
        position: { x: 0, y: 160 },
        type: 'workflowInput',
      },
      createTemplateActionNode('reframe', {
        data: {
          config: {
            targetAspectRatio: '1:1',
          },
          label: 'Square for Instagram',
        },
        id: 'reframe-square',
        position: { x: 320, y: 0 },
      }),
      createTemplateActionNode('workflow.collect-output', {
        data: {
          config: {
            outputName: 'square',
          },
          label: 'Square Output',
        },
        id: 'workflow-output-square',
        position: { x: 640, y: 0 },
      }),
      createTemplateActionNode('reframe', {
        data: {
          config: {
            targetAspectRatio: '9:16',
          },
          label: 'Portrait for TikTok',
        },
        id: 'reframe-portrait',
        position: { x: 320, y: 160 },
      }),
      createTemplateActionNode('workflow.collect-output', {
        data: {
          config: {
            outputName: 'portrait',
          },
          label: 'Portrait Output',
        },
        id: 'workflow-output-portrait',
        position: { x: 640, y: 160 },
      }),
      createTemplateActionNode('reframe', {
        data: {
          config: {
            targetAspectRatio: '16:9',
          },
          label: 'Landscape for YouTube and X',
        },
        id: 'reframe-landscape',
        position: { x: 320, y: 320 },
      }),
      createTemplateActionNode('workflow.collect-output', {
        data: {
          config: {
            outputName: 'landscape',
          },
          label: 'Landscape Output',
        },
        id: 'workflow-output-landscape',
        position: { x: 640, y: 320 },
      }),
    ],
  },
};
