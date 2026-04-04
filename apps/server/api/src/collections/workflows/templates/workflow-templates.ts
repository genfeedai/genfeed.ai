import { GENERATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/generation-templates';
import { WorkflowStepCategory } from '@genfeedai/enums';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  inputVariables?: Array<{
    key: string;
    type: string;
    label: string;
    description?: string;
    defaultValue?: unknown;
    required?: boolean;
    validation?: Record<string, unknown>;
  }>;
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
  steps: Array<{
    id: string;
    name: string;
    category: WorkflowStepCategory;
    config: Record<string, unknown>;
    dependsOn?: string[];
  }>;
}

export const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  ...GENERATION_WORKFLOW_TEMPLATES,
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
      {
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
        type: 'promptConstructor',
      },
      {
        data: {
          config: {
            outputName: 'adPack',
          },
          label: 'Ad Pack Output',
        },
        id: 'workflow-output-ad-pack',
        position: { x: 720, y: 120 },
        type: 'workflowOutput',
      },
      {
        data: {
          config: {
            outputName: 'launchPrep',
          },
          label: 'Launch Prep Output',
        },
        id: 'workflow-output-launch-prep',
        position: { x: 720, y: 280 },
        type: 'workflowOutput',
      },
    ],
    steps: [],
  },
  'content-clips': {
    category: 'editing',
    description: 'Generate multiple short clips from a longer video',
    icon: 'cut',
    id: 'content-clips',
    name: 'Create Content Clips',
    steps: [
      {
        category: WorkflowStepCategory.CLIP,
        config: {
          addTransitions: true,
          autoDetectHighlights: true,
          count: 5,
          duration: 30,
        },
        id: 'create-clips',
        name: 'Generate Clips',
      },
      {
        category: WorkflowStepCategory.CAPTION,
        config: {
          autoSync: true,
          style: 'dynamic',
        },
        dependsOn: ['create-clips'],
        id: 'add-clip-captions',
        name: 'Add Captions to Clips',
      },
      {
        category: WorkflowStepCategory.RESIZE,
        config: {
          aspectRatio: '9:16',
          maintainQuality: true,
        },
        dependsOn: ['add-clip-captions'],
        id: 'resize-clips',
        name: 'Resize for Social',
      },
    ],
  },
  'multi-platform-resize': {
    category: 'batch',
    description: 'Create multiple versions for different social platforms',
    icon: 'resize',
    id: 'multi-platform-resize',
    name: 'Multi-Platform Resize',
    steps: [
      {
        category: WorkflowStepCategory.RESIZE,
        config: {
          aspectRatio: '1:1',
          height: 1080,
          platform: 'instagram',
          width: 1080,
        },
        id: 'resize-square',
        name: 'Square for Instagram',
      },
      {
        category: WorkflowStepCategory.RESIZE,
        config: {
          aspectRatio: '9:16',
          height: 1920,
          platform: 'tiktok',
          width: 1080,
        },
        id: 'resize-portrait',
        name: 'Portrait for TikTok',
      },
      {
        category: WorkflowStepCategory.RESIZE,
        config: {
          aspectRatio: '16:9',
          height: 1080,
          platform: 'youtube',
          width: 1920,
        },
        id: 'resize-landscape',
        name: 'Landscape for YouTube',
      },
      {
        category: WorkflowStepCategory.RESIZE,
        config: {
          aspectRatio: '16:9',
          height: 720,
          platform: 'twitter',
          width: 1280,
        },
        id: 'resize-twitter',
        name: 'Twitter Format',
      },
    ],
  },
  'social-media-publish': {
    category: 'social',
    description: 'Transform, upscale and publish to TikTok & Instagram',
    icon: 'share',
    id: 'social-media-publish',
    name: 'Publish to Social Media',
    steps: [
      {
        category: WorkflowStepCategory.TRANSFORM,
        config: {
          aspectRatio: '9:16',
          maintainQuality: true,
          orientation: 'portrait',
        },
        id: 'transform-portrait',
        name: 'Transform to Portrait',
      },
      {
        category: WorkflowStepCategory.UPSCALE,
        config: {
          fps: 30,
          quality: 'high',
          resolution: '1080p',
        },
        dependsOn: ['transform-portrait'],
        id: 'upscale-1080',
        name: 'Upscale to 1080p',
      },
      {
        category: WorkflowStepCategory.CAPTION,
        config: {
          backgroundColor: 'rgba(0,0,0,0.7)',
          fontColor: '#FFFFFF',
          fontSize: 'medium',
          position: 'bottom',
          style: 'minimal',
        },
        dependsOn: ['upscale-1080'],
        id: 'add-captions',
        name: 'Add Captions',
      },
      {
        category: WorkflowStepCategory.PUBLISH,
        config: {
          addWatermark: false,
          platforms: ['tiktok', 'instagram'],
          schedule: 'immediate',
        },
        dependsOn: ['add-captions'],
        id: 'publish-social',
        name: 'Publish to Platforms',
      },
    ],
  },
  'webhook-notification': {
    category: 'integration',
    description: 'Process content and send webhook notification',
    icon: 'webhook',
    id: 'webhook-notification',
    name: 'Process and Notify',
    steps: [
      {
        category: WorkflowStepCategory.UPSCALE,
        config: {
          quality: 'high',
          resolution: '1080p',
        },
        id: 'process-video',
        name: 'Process Video',
      },
      {
        category: WorkflowStepCategory.WEBHOOK,
        config: {
          headers: {
            'Content-Type': 'application/json',
          },
          includeAssetUrl: true,
          includeMetadata: true,
          method: 'POST',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          url: '${GENFEEDAI_WEBHOOKS_URL}',
        },
        dependsOn: ['process-video'],
        id: 'notify-webhook',
        name: 'Send Webhook',
      },
    ],
  },
  'youtube-optimization': {
    category: 'video',
    description: 'Optimize video for YouTube with 4K upscaling and chapters',
    icon: 'youtube',
    id: 'youtube-optimization',
    name: 'YouTube Optimization',
    steps: [
      {
        category: WorkflowStepCategory.TRANSFORM,
        config: {
          aspectRatio: '16:9',
          maintainQuality: true,
          orientation: 'landscape',
        },
        id: 'transform-landscape',
        name: 'Transform to Landscape',
      },
      {
        category: WorkflowStepCategory.UPSCALE,
        config: {
          bitrate: 'high',
          fps: 60,
          quality: 'maximum',
          resolution: '4k',
        },
        dependsOn: ['transform-landscape'],
        id: 'upscale-4k',
        name: 'Upscale to 4K',
      },
      {
        category: WorkflowStepCategory.CAPTION,
        config: {
          generateChapters: true,
          generateTranscript: true,
          languages: ['en', 'es', 'fr'],
          style: 'youtube',
        },
        dependsOn: ['upscale-4k'],
        id: 'add-youtube-captions',
        name: 'Add YouTube Captions',
      },
      {
        category: WorkflowStepCategory.PUBLISH,
        config: {
          category: 'entertainment',
          monetization: true,
          platforms: ['youtube'],
          visibility: 'public',
        },
        dependsOn: ['add-youtube-captions'],
        id: 'publish-youtube',
        name: 'Publish to YouTube',
      },
    ],
  },
};
