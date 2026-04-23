import { WorkflowStepCategory } from '@genfeedai/enums';

/**
 * Node Registry - Function Library for Visual Workflow Builder
 *
 * Defines all available node types that users can drag onto the workflow canvas.
 * Each node maps to an existing WorkflowStepCategory or a new processing function.
 */

// =============================================================================
// TYPES
// =============================================================================

export type NodeInputType =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'number'
  | 'boolean'
  | 'any';

export interface NodePort {
  type: NodeInputType;
  label: string;
  required?: boolean;
  multiple?: boolean;
}

export interface NodeConfigField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'asset' | 'variable';
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  min?: number;
  max?: number;
}

export interface NodeDefinition {
  label: string;
  description: string;
  category: 'input' | 'processing' | 'effects' | 'ai' | 'output' | 'control';
  icon: string;
  inputs: Record<string, NodePort>;
  outputs: Record<string, NodePort>;
  configSchema: Record<string, NodeConfigField>;
  maps?: WorkflowStepCategory; // Maps to existing step category
  isPremium?: boolean;
  isEnabled?: boolean;
  type?: string;
}

// =============================================================================
// NODE REGISTRY
// =============================================================================

export const NODE_REGISTRY: Record<string, NodeDefinition> = {
  'ai-avatar-video': {
    category: 'ai',
    configSchema: {
      aspectRatio: {
        default: '9:16',
        label: 'Aspect Ratio',
        options: ['9:16', '16:9', '1:1'],
        type: 'select',
      },
      provider: {
        default: 'heygen',
        label: 'Provider',
        options: ['heygen'],
        type: 'select',
      },
      useIdentityDefaults: {
        default: true,
        label: 'Use Identity Defaults',
        type: 'boolean',
      },
    },
    description:
      'Generate a talking-head avatar video using saved identity defaults or runtime overrides',
    icon: 'HiVideoCamera',
    inputs: {
      audioUrl: { label: 'Audio URL', required: false, type: 'audio' },
      clonedVoiceId: {
        label: 'Cloned Voice ID',
        required: false,
        type: 'text',
      },
      photoUrl: { label: 'Photo URL', required: false, type: 'image' },
      script: { label: 'Script', required: true, type: 'text' },
    },
    isPremium: true,
    label: 'Avatar UGC Video',
    outputs: {
      video: { label: 'Generated Video', type: 'video' },
    },
  },
  'ai-enhance': {
    category: 'ai',
    configSchema: {
      strength: {
        default: 0.5,
        label: 'Strength',
        max: 1,
        min: 0,
        type: 'number',
      },
      type: {
        default: 'denoise',
        label: 'Enhancement Type',
        options: ['denoise', 'colorize', 'restore', 'sharpen'],
        type: 'select',
      },
    },
    description: 'Enhance media quality using AI',
    icon: 'HiSparkles',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    isPremium: true,
    label: 'AI Enhance',
    outputs: {
      media: { label: 'Enhanced Media', type: 'any' },
    },
  },

  'ai-generate-image': {
    category: 'ai',
    configSchema: {
      aspectRatio: {
        default: '1:1',
        label: 'Aspect Ratio',
        options: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        type: 'select',
      },
      model: {
        default: 'flux-pro',
        label: 'Model',
        options: [
          'flux-pro',
          'flux-dev',
          'black-forest-labs/flux-2-pro',
          'dall-e-3',
          'stable-diffusion',
          'genfeed-ai/flux-dev',
          'genfeed-ai/flux-dev-pulid',
          'genfeed-ai/z-image-turbo',
          'genfeed-ai/flux2-dev',
          'genfeed-ai/flux2-dev-pulid',
          'genfeed-ai/flux2-dev-pulid-lora',
          'genfeed-ai/flux2-dev-pulid-upscale',
          'genfeed-ai/flux2-klein',
          'genfeed-ai/z-image-turbo-lora',
          'qwen/qwen-image',
        ],
        type: 'select',
      },
      negativePrompt: {
        description: 'Elements to avoid in the generated image',
        label: 'Negative Prompt',
        type: 'string',
      },
      strength: {
        default: 0.9,
        description:
          'How strongly to transform the source image when image guidance is used',
        label: 'Image Strength',
        max: 1,
        min: 0,
        type: 'number',
      },
      style: {
        description: 'Style prompt modifier',
        label: 'Style',
        type: 'string',
      },
    },
    description: 'Generate image from prompt using AI',
    icon: 'HiSparkles',
    inputs: {
      image: { label: 'Source Image', required: false, type: 'image' },
      prompt: { label: 'Prompt', type: 'text' },
    },
    label: 'Generate Image',
    maps: WorkflowStepCategory.GENERATE_IMAGE,
    outputs: {
      image: { label: 'Generated Image', type: 'image' },
    },
  },

  'ai-generate-newsletter': {
    category: 'ai',
    configSchema: {
      brandId: {
        description: 'Brand ID used to scope newsletter memory and ownership',
        label: 'Brand ID',
        required: true,
        type: 'string',
      },
      brandLabel: {
        description: 'Optional brand label for prompt grounding',
        label: 'Brand Label',
        type: 'string',
      },
      instructions: {
        description: 'Editorial instructions for the generated issue',
        label: 'Instructions',
        type: 'string',
      },
      prompt: {
        description: 'Prompt that defines the recurring newsletter output',
        label: 'Prompt',
        required: true,
        type: 'string',
      },
      timezone: {
        default: 'UTC',
        label: 'Timezone',
        type: 'string',
      },
    },
    description: 'Generate a review-ready newsletter draft for a brand',
    icon: 'HiEnvelope',
    inputs: {},
    label: 'Generate Newsletter',
    outputs: {
      newsletter: { label: 'Generated Newsletter', type: 'any' },
    },
  },

  'ai-generate-post': {
    category: 'ai',
    configSchema: {
      brandId: {
        description: 'Brand ID used to scope the generated draft',
        label: 'Brand ID',
        required: true,
        type: 'string',
      },
      brandLabel: {
        description: 'Optional brand label for prompt grounding',
        label: 'Brand Label',
        type: 'string',
      },
      credentialId: {
        description: 'Optional explicit credential ID for the draft platform',
        label: 'Credential ID',
        type: 'string',
      },
      prompt: {
        description: 'Prompt that defines the recurring social post output',
        label: 'Prompt',
        required: true,
        type: 'string',
      },
      timezone: {
        default: 'UTC',
        label: 'Timezone',
        type: 'string',
      },
    },
    description: 'Generate a review-ready social post draft for a brand',
    icon: 'HiChatBubbleBottomCenterText',
    inputs: {},
    label: 'Generate Post',
    outputs: {
      post: { label: 'Generated Post', type: 'any' },
    },
  },

  'ai-generate-video': {
    category: 'ai',
    configSchema: {
      aspectRatio: {
        default: '16:9',
        label: 'Aspect Ratio',
        options: ['16:9', '9:16', '1:1'],
        type: 'select',
      },
      duration: {
        default: 5,
        description: 'Duration in seconds',
        label: 'Duration',
        type: 'number',
      },
      model: {
        default: 'kling-v2',
        label: 'Model',
        options: ['kling-v2', 'runway-gen3', 'veo-3', 'minimax'],
        type: 'select',
      },
    },
    description: 'Generate video from prompt or image using AI',
    icon: 'HiVideoCamera',
    inputs: {
      image: { label: 'Reference Image', required: false, type: 'image' },
      prompt: { label: 'Prompt', type: 'text' },
    },
    isPremium: true,
    label: 'Generate Video',
    maps: WorkflowStepCategory.GENERATE_VIDEO,
    outputs: {
      video: { label: 'Generated Video', type: 'video' },
    },
  },

  // ===========================================================================
  // AI NODES
  // ===========================================================================

  'ai-lip-sync': {
    category: 'ai',
    configSchema: {
      mode: {
        default: 'image',
        label: 'Mode',
        options: ['video', 'image'],
        type: 'select',
      },
    },
    description: 'Generate lip-synced video from image/video and audio',
    icon: 'HiVideoCamera',
    inputs: {
      audio: { label: 'Audio', required: true, type: 'audio' },
      image: { label: 'Image', required: false, type: 'image' },
      video: { label: 'Video', required: false, type: 'video' },
    },
    isPremium: true,
    label: 'Lip Sync',
    outputs: {
      video: { label: 'Lip-Synced Video', type: 'video' },
    },
  },

  'ai-llm': {
    category: 'ai',
    configSchema: {
      maxTokens: {
        default: 1024,
        description: 'Maximum tokens to generate',
        label: 'Max Tokens',
        max: 8192,
        min: 1,
        type: 'number',
      },
      model: {
        default: 'claude-sonnet-4-5',
        description: 'LLM model to use for generation',
        label: 'Model',
        options: [
          'claude-sonnet-4-5',
          'claude-haiku-4-5',
          'gpt-4o',
          'gpt-4o-mini',
          'openrouter/auto',
        ],
        type: 'select',
      },
      systemPrompt: {
        description: 'System prompt to guide the LLM',
        label: 'System Prompt',
        type: 'string',
      },
      temperature: {
        default: 0.7,
        description: 'Sampling temperature (0-1)',
        label: 'Temperature',
        max: 1,
        min: 0,
        type: 'number',
      },
    },
    description:
      'Call a language model with a text prompt and get a text response',
    icon: 'HiSparkles',
    inputs: {
      prompt: { label: 'Prompt', type: 'text' },
    },
    isPremium: false,
    label: 'LLM',
    outputs: {
      text: { label: 'Response Text', type: 'text' },
    },
  },

  'ai-prompt-constructor': {
    category: 'ai',
    configSchema: {
      template: {
        description: 'Prompt template with {{variable}} placeholders',
        label: 'Template',
        required: true,
        type: 'string',
      },
      variables: {
        description: 'Key-value pairs to substitute into the template',
        label: 'Variables',
        type: 'string',
      },
    },
    description: 'Compose prompts from templates with variable substitution',
    icon: 'HiDocumentText',
    inputs: {
      listingTier: { label: 'Listing Tier', required: false, type: 'text' },
      propertyType: { label: 'Property Type', required: false, type: 'text' },
      roomType: { label: 'Room Type', required: false, type: 'text' },
      stylePreset: { label: 'Style Preset', required: false, type: 'text' },
      targetSpace: { label: 'Target Space', required: false, type: 'text' },
    },
    label: 'Prompt Constructor',
    outputs: {
      prompt: { label: 'Prompt', type: 'text' },
    },
  },

  'ai-reframe': {
    category: 'ai',
    configSchema: {
      format: {
        default: 'landscape',
        label: 'Format',
        options: ['landscape', 'portrait', 'square'],
        type: 'select',
      },
      targetAspectRatio: {
        default: '16:9',
        label: 'Target Aspect Ratio',
        options: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        type: 'select',
      },
    },
    description: 'Reframe image or video to a different aspect ratio using AI',
    icon: 'HiArrowsPointingOut',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    isPremium: true,
    label: 'AI Reframe',
    outputs: {
      media: { label: 'Reframed Media', type: 'any' },
    },
  },

  'ai-text-to-speech': {
    category: 'ai',
    configSchema: {
      text: {
        description: 'Text to convert to speech (overridden by input port)',
        label: 'Text',
        type: 'string',
      },
      voiceId: {
        description: 'ElevenLabs voice ID',
        label: 'Voice',
        required: true,
        type: 'select',
      },
    },
    description: 'Convert text to speech audio using AI',
    icon: 'HiSpeakerWave',
    inputs: {
      text: { label: 'Text', required: false, type: 'text' },
    },
    label: 'Text to Speech',
    outputs: {
      audio: { label: 'Audio', type: 'audio' },
      duration: { label: 'Duration', type: 'number' },
    },
  },

  'ai-transcribe': {
    category: 'ai',
    configSchema: {
      language: {
        default: 'auto',
        label: 'Language',
        options: ['en', 'es', 'fr', 'de', 'it', 'pt', 'auto'],
        type: 'select',
      },
    },
    description: 'Transcribe audio to text using AI',
    icon: 'HiMicrophone',
    inputs: {
      audio: { label: 'Audio', type: 'audio' },
    },
    label: 'Transcribe Audio',
    outputs: {
      text: { label: 'Transcript', type: 'text' },
    },
  },

  'ai-upscale': {
    category: 'ai',
    configSchema: {
      model: {
        default: 'real-esrgan',
        label: 'Model',
        options: ['real-esrgan', 'topaz'],
        type: 'select',
      },
      scale: {
        default: '2x',
        label: 'Scale',
        options: ['2x', '4x'],
        type: 'select',
      },
    },
    description: 'Upscale media resolution using AI',
    icon: 'HiArrowsPointingOut',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    isPremium: true,
    label: 'AI Upscale',
    maps: WorkflowStepCategory.UPSCALE,
    outputs: {
      media: { label: 'Upscaled Media', type: 'any' },
    },
  },

  'ai-voice-change': {
    category: 'ai',
    configSchema: {
      pitchShift: {
        default: 0,
        description: 'Shift pitch in semitones (-12 to 12)',
        label: 'Pitch Shift',
        max: 12,
        min: -12,
        type: 'number',
      },
      targetVoiceId: {
        label: 'Target Voice',
        options: [
          'male-deep',
          'male-mid',
          'female-alto',
          'female-soprano',
          'child',
          'robot',
          'whisper',
        ],
        required: true,
        type: 'select',
      },
    },
    description: 'Change the voice of an audio file',
    icon: 'HiMicrophone',
    inputs: {
      audio: { label: 'Audio', type: 'audio' },
    },
    isPremium: true,
    label: 'Voice Change',
    outputs: {
      audio: { label: 'Changed Audio', type: 'audio' },
    },
  },

  'control-branch': {
    category: 'control',
    configSchema: {
      customField: {
        description: 'Dot-notation path when field is "custom"',
        label: 'Custom Field Path',
        type: 'string',
      },
      expression: {
        description: 'JS-like expression (e.g. value > 10)',
        label: 'Expression',
        type: 'string',
      },
      field: {
        default: 'custom',
        description: 'Field to evaluate',
        label: 'Field',
        options: [
          'engagementRate',
          'followerCount',
          'contentType',
          'platform',
          'timeOfDay',
          'dayOfWeek',
          'custom',
        ],
        type: 'select',
      },
      operator: {
        default: 'equals',
        label: 'Operator',
        options: [
          'equals',
          'notEquals',
          'greaterThan',
          'lessThan',
          'greaterThanOrEquals',
          'lessThanOrEquals',
          'contains',
          'notContains',
          'startsWith',
          'endsWith',
          'matches',
          'isTrue',
          'isFalse',
          'isEmpty',
          'isNotEmpty',
          'expression',
        ],
        type: 'select',
      },
      timezone: {
        description: 'Timezone for time-based conditions',
        label: 'Timezone',
        type: 'string',
      },
      value: {
        label: 'Compare Value',
        type: 'string',
      },
    },
    description:
      'Branch based on condition (engagement, followers, time, etc.)',
    icon: 'HiAdjustmentsHorizontal',
    inputs: {
      value: { label: 'Value', type: 'any' },
    },
    label: 'Conditional Branch',
    outputs: {
      false: { label: 'If False', type: 'any' },
      true: { label: 'If True', type: 'any' },
    },
  },

  'control-delay': {
    category: 'control',
    configSchema: {
      duration: {
        default: 5,
        description: 'Delay duration value',
        label: 'Duration',
        type: 'number',
      },
      mode: {
        default: 'fixed',
        description: 'Delay mode',
        label: 'Mode',
        options: ['fixed', 'until', 'optimal'],
        type: 'select',
      },
      platform: {
        description: 'Platform for optimal posting time',
        label: 'Platform',
        options: ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'],
        type: 'select',
      },
      timezone: {
        description: 'Timezone (e.g. America/New_York)',
        label: 'Timezone',
        type: 'string',
      },
      unit: {
        default: 'minutes',
        description: 'Time unit for fixed delay',
        label: 'Unit',
        options: ['seconds', 'minutes', 'hours', 'days'],
        type: 'select',
      },
      untilTime: {
        description: 'ISO 8601 timestamp to wait until',
        label: 'Until Time',
        type: 'string',
      },
    },
    description:
      'Wait for duration, until specific time, or optimal posting time',
    icon: 'HiClock',
    inputs: {
      trigger: { label: 'Trigger', type: 'any' },
    },
    label: 'Delay',
    maps: WorkflowStepCategory.DELAY,
    outputs: {
      trigger: { label: 'Continue', type: 'any' },
    },
  },

  'control-loop': {
    category: 'control',
    configSchema: {},
    description: 'Iterate over array of items',
    icon: 'HiArrowPath',
    inputs: {
      items: { label: 'Items', multiple: true, type: 'any' },
    },
    label: 'Loop',
    outputs: {
      index: { label: 'Index', type: 'number' },
      item: { label: 'Current Item', type: 'any' },
    },
  },

  'effect-captions': {
    category: 'effects',
    configSchema: {
      fontColor: {
        default: '#FFFFFF',
        label: 'Font Color',
        type: 'string',
      },
      fontSize: {
        default: 'medium',
        label: 'Font Size',
        options: ['small', 'medium', 'large'],
        type: 'select',
      },
      position: {
        default: 'bottom',
        label: 'Position',
        options: ['top', 'center', 'bottom'],
        type: 'select',
      },
      style: {
        default: 'dynamic',
        label: 'Style',
        options: ['minimal', 'dynamic', 'youtube', 'tiktok'],
        type: 'select',
      },
    },
    description: 'Burn captions/subtitles into video',
    icon: 'HiLanguage',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Add Captions',
    maps: WorkflowStepCategory.CAPTION,
    outputs: {
      video: { label: 'Captioned Video', type: 'video' },
    },
  },

  // ===========================================================================
  // EFFECTS NODES
  // ===========================================================================

  'effect-color-grade': {
    category: 'effects',
    configSchema: {
      contrast: {
        default: 55,
        description: 'Contrast intensity (0-100)',
        label: 'Contrast',
        max: 100,
        min: 0,
        type: 'number',
      },
      grain: {
        default: 15,
        description: 'Film grain amount (0-100)',
        label: 'Grain',
        max: 100,
        min: 0,
        type: 'number',
      },
      mode: {
        default: 'preset',
        label: 'Mode',
        options: ['preset', 'custom', 'ai-style'],
        type: 'select',
      },
      preset: {
        default: 'instagram-warm',
        label: 'Preset',
        options: [
          'instagram-warm',
          'instagram-cool',
          'instagram-moody',
          'instagram-bright',
          'custom',
        ],
        type: 'select',
      },
      saturation: {
        default: 45,
        description: 'Color saturation (0-100)',
        label: 'Saturation',
        max: 100,
        min: 0,
        type: 'number',
      },
      sharpness: {
        default: 40,
        description: 'Sharpening strength (0-100)',
        label: 'Sharpness',
        max: 100,
        min: 0,
        type: 'number',
      },
      styleReferenceImage: {
        description: 'Reference image URL for AI style transfer mode',
        label: 'Style Reference',
        type: 'string',
      },
      vignette: {
        default: 30,
        description: 'Edge darkening amount (0-100)',
        label: 'Vignette',
        max: 100,
        min: 0,
        type: 'number',
      },
      warmth: {
        default: 60,
        description: 'Color temperature warmth (0-100)',
        label: 'Warmth',
        max: 100,
        min: 0,
        type: 'number',
      },
    },
    description: 'Apply Instagram-style color grading to images',
    icon: 'HiSwatch',
    inputs: {
      image: { label: 'Image', type: 'image' },
    },
    isPremium: false,
    label: 'Color Grade',
    maps: WorkflowStepCategory.COLOR_GRADE,
    outputs: {
      image: { label: 'Graded Image', type: 'image' },
    },
  },

  'effect-ken-burns': {
    category: 'effects',
    configSchema: {
      direction: {
        default: 'in',
        label: 'Direction',
        options: ['in', 'out'],
        type: 'select',
      },
      duration: {
        default: 5,
        description: 'Duration in seconds',
        label: 'Duration',
        type: 'number',
      },
      zoomLevel: {
        default: 1.2,
        description: 'Zoom multiplier (1.0-2.0)',
        label: 'Zoom Level',
        max: 2.0,
        min: 1.0,
        type: 'number',
      },
    },
    description: 'Apply zoom/pan animation to image',
    icon: 'HiSparkles',
    inputs: {
      image: { label: 'Image', type: 'image' },
    },
    label: 'Ken Burns Effect',
    outputs: {
      video: { label: 'Video', type: 'video' },
    },
  },

  'effect-portrait-blur': {
    category: 'effects',
    configSchema: {
      blurIntensity: {
        default: 20,
        label: 'Blur Intensity',
        max: 50,
        min: 0,
        type: 'number',
      },
    },
    description: 'Convert landscape to portrait with blurred background',
    icon: 'HiSparkles',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Portrait Blur',
    outputs: {
      video: { label: 'Portrait Video', type: 'video' },
    },
  },

  'effect-split-screen': {
    category: 'effects',
    configSchema: {
      layout: {
        default: 'horizontal',
        label: 'Layout',
        options: ['horizontal', 'vertical'],
        type: 'select',
      },
    },
    description: 'Create split screen layout with two videos',
    icon: 'HiViewColumns',
    inputs: {
      left: { label: 'Left Video', type: 'video' },
      right: { label: 'Right Video', type: 'video' },
    },
    label: 'Split Screen',
    outputs: {
      video: { label: 'Split Screen Video', type: 'video' },
    },
  },

  'effect-text-overlay': {
    category: 'effects',
    configSchema: {
      fontColor: {
        default: '#FFFFFF',
        label: 'Font Color',
        type: 'string',
      },
      fontSize: {
        default: 48,
        label: 'Font Size',
        type: 'number',
      },
      position: {
        default: 'bottom',
        label: 'Position',
        options: ['top', 'center', 'bottom'],
        type: 'select',
      },
      text: {
        label: 'Text',
        required: true,
        type: 'string',
      },
    },
    description: 'Add text overlay to video',
    icon: 'HiPencil',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Text Overlay',
    outputs: {
      video: { label: 'Video with Text', type: 'video' },
    },
  },

  'effect-watermark': {
    category: 'effects',
    configSchema: {
      opacity: {
        default: 0.5,
        label: 'Opacity',
        max: 1,
        min: 0,
        type: 'number',
      },
      position: {
        default: 'bottom-right',
        label: 'Position',
        options: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        type: 'select',
      },
      text: {
        label: 'Watermark Text',
        type: 'string',
      },
    },
    description: 'Add watermark image or text to video',
    icon: 'HiShieldCheck',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Add Watermark',
    outputs: {
      video: { label: 'Watermarked Video', type: 'video' },
    },
  },
  // ===========================================================================
  // INPUT NODES
  // ===========================================================================

  'input-image': {
    category: 'input',
    configSchema: {
      assetId: {
        description: 'Select from asset library',
        label: 'Asset',
        type: 'asset',
      },
      source: {
        default: 'asset-library',
        label: 'Source',
        options: ['upload', 'asset-library', 'url', 'variable'],
        type: 'select',
      },
      url: {
        description: 'External image URL',
        label: 'URL',
        type: 'string',
      },
      variableKey: {
        description: 'Use workflow input variable',
        label: 'Variable',
        type: 'variable',
      },
    },
    description: 'Load an image from upload, asset library, or URL',
    icon: 'HiPhoto',
    inputs: {},
    label: 'Image Input',
    outputs: {
      image: { label: 'Image', type: 'image' },
    },
  },

  'input-prompt': {
    category: 'input',
    configSchema: {
      text: {
        description: 'Enter prompt or use variable',
        label: 'Prompt Text',
        type: 'string',
      },
      variableKey: {
        description: 'Use workflow input variable',
        label: 'Variable',
        type: 'variable',
      },
    },
    description: 'Text prompt for AI generation',
    icon: 'HiChatBubbleLeft',
    inputs: {},
    label: 'Prompt Input',
    outputs: {
      prompt: { label: 'Prompt', type: 'text' },
    },
  },

  'input-template': {
    category: 'input',
    configSchema: {
      templateId: {
        description: 'Select prompt template',
        label: 'Template ID',
        type: 'string',
      },
    },
    description: 'Load a prompt template',
    icon: 'HiTemplate',
    inputs: {},
    label: 'Template Input',
    outputs: {
      template: { label: 'Template Data', type: 'any' },
    },
  },

  'input-video': {
    category: 'input',
    configSchema: {
      assetId: {
        description: 'Select from asset library',
        label: 'Asset',
        type: 'asset',
      },
      source: {
        default: 'asset-library',
        label: 'Source',
        options: ['upload', 'asset-library', 'url', 'variable'],
        type: 'select',
      },
      url: {
        description: 'External video URL',
        label: 'URL',
        type: 'string',
      },
      variableKey: {
        description: 'Use workflow input variable',
        label: 'Variable',
        type: 'variable',
      },
    },
    description: 'Load a video from upload, asset library, or URL',
    icon: 'HiVideoCamera',
    inputs: {},
    label: 'Video Input',
    outputs: {
      video: { label: 'Video', type: 'video' },
    },
  },

  'output-export': {
    category: 'output',
    configSchema: {
      format: {
        default: 'mp4',
        label: 'Format',
        options: ['mp4', 'mov', 'webm', 'gif', 'png', 'jpg'],
        type: 'select',
      },
      quality: {
        default: 'high',
        label: 'Quality',
        options: ['low', 'medium', 'high', 'max'],
        type: 'select',
      },
    },
    description: 'Export to downloadable file',
    icon: 'HiArrowDownTray',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    label: 'Export File',
    outputs: {},
  },

  'output-notify': {
    category: 'output',
    configSchema: {
      message: {
        label: 'Message',
        type: 'string',
      },
      target: {
        description: 'Email address or Slack channel',
        label: 'Target',
        type: 'string',
      },
      type: {
        default: 'email',
        label: 'Type',
        options: ['email', 'slack', 'push'],
        type: 'select',
      },
    },
    description: 'Send notification when workflow completes',
    icon: 'HiBell',
    inputs: {
      data: { label: 'Data', type: 'any' },
    },
    label: 'Send Notification',
    outputs: {},
  },

  'output-publish': {
    category: 'output',
    configSchema: {
      caption: {
        label: 'Caption',
        type: 'string',
      },
      platforms: {
        label: 'Platforms',
        options: ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'],
        type: 'select',
      },
      schedule: {
        default: 'immediate',
        label: 'Schedule',
        options: ['immediate', 'scheduled'],
        type: 'select',
      },
    },
    description: 'Publish content to social media platforms',
    icon: 'HiShare',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    label: 'Publish to Social',
    maps: WorkflowStepCategory.PUBLISH,
    outputs: {},
  },

  // ===========================================================================
  // OUTPUT NODES
  // ===========================================================================

  'output-save': {
    category: 'output',
    configSchema: {
      folder: {
        description: 'Target folder in library',
        label: 'Folder',
        type: 'string',
      },
      name: {
        description: 'Asset name',
        label: 'Name',
        type: 'string',
      },
    },
    description: 'Save output to asset library',
    icon: 'HiFolder',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    label: 'Save to Library',
    outputs: {},
  },

  'output-webhook': {
    category: 'output',
    configSchema: {
      method: {
        default: 'POST',
        label: 'Method',
        options: ['POST', 'PUT'],
        type: 'select',
      },
      url: {
        label: 'Webhook URL',
        required: true,
        type: 'string',
      },
    },
    description: 'Send data to external webhook',
    icon: 'HiLink',
    inputs: {
      data: { label: 'Data', type: 'any' },
    },
    label: 'Webhook',
    maps: WorkflowStepCategory.WEBHOOK,
    outputs: {},
  },

  'process-compress': {
    category: 'processing',
    configSchema: {
      crf: {
        default: 23,
        description: 'Constant Rate Factor (18-28)',
        label: 'CRF',
        max: 28,
        min: 18,
        type: 'number',
      },
      quality: {
        default: 'medium',
        label: 'Quality',
        options: ['low', 'medium', 'high'],
        type: 'select',
      },
    },
    description: 'Reduce video file size',
    icon: 'HiArchiveBox',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Compress Video',
    outputs: {
      video: { label: 'Compressed Video', type: 'video' },
    },
  },

  'process-extract-audio': {
    category: 'processing',
    configSchema: {
      format: {
        default: 'mp3',
        label: 'Format',
        options: ['mp3', 'wav', 'aac'],
        type: 'select',
      },
    },
    description: 'Extract audio track from video',
    icon: 'HiMusicalNote',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Extract Audio',
    outputs: {
      audio: { label: 'Audio', type: 'audio' },
    },
  },

  'process-merge-videos': {
    category: 'processing',
    configSchema: {
      transition: {
        default: 'none',
        label: 'Transition',
        options: ['none', 'fade', 'dissolve', 'wipe'],
        type: 'select',
      },
      transitionDuration: {
        default: 0.5,
        description: 'Duration in seconds',
        label: 'Transition Duration',
        type: 'number',
      },
    },
    description: 'Concatenate multiple videos into one',
    icon: 'HiSquare2Stack',
    inputs: {
      videos: { label: 'Videos', multiple: true, type: 'video' },
    },
    label: 'Merge Videos',
    outputs: {
      video: { label: 'Merged Video', type: 'video' },
    },
  },

  'process-mirror': {
    category: 'processing',
    configSchema: {
      direction: {
        default: 'horizontal',
        label: 'Direction',
        options: ['horizontal', 'vertical'],
        type: 'select',
      },
    },
    description: 'Flip video horizontally',
    icon: 'HiArrowsRightLeft',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Mirror Video',
    outputs: {
      video: { label: 'Mirrored Video', type: 'video' },
    },
  },

  'process-resize': {
    category: 'processing',
    configSchema: {
      aspectRatio: {
        label: 'Aspect Ratio',
        options: ['16:9', '9:16', '1:1', '4:3', '4:5'],
        type: 'select',
      },
      fit: {
        default: 'contain',
        label: 'Fit Mode',
        options: ['contain', 'cover', 'fill', 'inside', 'outside'],
        type: 'select',
      },
      height: {
        description: 'Target height in pixels',
        label: 'Height',
        type: 'number',
      },
      width: {
        description: 'Target width in pixels',
        label: 'Width',
        type: 'number',
      },
    },
    description: 'Resize media to specific dimensions',
    icon: 'HiArrowsRightLeft',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    label: 'Resize',
    maps: WorkflowStepCategory.RESIZE,
    outputs: {
      media: { label: 'Resized Media', type: 'any' },
    },
  },

  'process-reverse': {
    category: 'processing',
    configSchema: {},
    description: 'Reverse video playback',
    icon: 'HiArrowPath',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Reverse Video',
    outputs: {
      video: { label: 'Reversed Video', type: 'video' },
    },
  },

  // ===========================================================================
  // PROCESSING NODES
  // ===========================================================================

  'process-transform': {
    category: 'processing',
    configSchema: {
      aspectRatio: {
        default: '9:16',
        label: 'Aspect Ratio',
        options: ['16:9', '9:16', '1:1', '4:3', '4:5'],
        type: 'select',
      },
      orientation: {
        default: 'portrait',
        label: 'Orientation',
        options: ['portrait', 'landscape', 'square'],
        type: 'select',
      },
    },
    description: 'Transform media aspect ratio or orientation',
    icon: 'HiArrowsPointingOut',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    label: 'Transform',
    maps: WorkflowStepCategory.TRANSFORM,
    outputs: {
      media: { label: 'Transformed Media', type: 'any' },
    },
  },

  'process-trim': {
    category: 'processing',
    configSchema: {
      endTime: {
        description: 'End time in seconds',
        label: 'End Time',
        type: 'number',
      },
      startTime: {
        default: 0,
        description: 'Start time in seconds',
        label: 'Start Time',
        type: 'number',
      },
    },
    description: 'Trim video to specific start and end times',
    icon: 'HiScissors',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Trim Video',
    maps: WorkflowStepCategory.CLIP,
    outputs: {
      video: { label: 'Trimmed Video', type: 'video' },
    },
  },

  // ===========================================================================
  // CONTROL NODES
  // ===========================================================================

  'workflow-input': {
    category: 'control',
    configSchema: {
      inputName: {
        description: 'Name for this workflow input parameter',
        label: 'Input Name',
        required: true,
        type: 'string',
      },
      inputType: {
        default: 'text',
        description: 'Data type of this input',
        label: 'Input Type',
        options: ['text', 'image', 'video', 'audio', 'number', 'boolean'],
        type: 'select',
      },
    },
    description:
      'Define an input parameter for this workflow when used as a sub-workflow',
    icon: 'HiArrowDownOnSquare',
    inputs: {},
    isEnabled: true,
    isPremium: false,
    label: 'Workflow Input',
    outputs: {
      value: { label: 'Input Value', type: 'any' },
    },
  },

  'workflow-output': {
    category: 'control',
    configSchema: {
      outputName: {
        description: 'Name for this workflow output parameter',
        label: 'Output Name',
        required: true,
        type: 'string',
      },
    },
    description:
      'Define an output parameter for this workflow when used as a sub-workflow',
    icon: 'HiArrowUpOnSquare',
    inputs: {
      value: { label: 'Output Value', type: 'any' },
    },
    isEnabled: true,
    isPremium: false,
    label: 'Workflow Output',
    outputs: {},
  },

  'workflow-ref': {
    category: 'control',
    configSchema: {
      workflowId: {
        description: 'ID of the workflow to run as a sub-workflow',
        label: 'Workflow',
        required: true,
        type: 'string',
      },
    },
    description:
      'Execute another workflow as a sub-workflow and use its outputs',
    icon: 'HiArrowPath',
    inputs: {
      inputs: { label: 'Sub-workflow Inputs', type: 'any' },
    },
    isEnabled: true,
    isPremium: false,
    label: 'Sub-workflow',
    outputs: {
      outputs: { label: 'Sub-workflow Outputs', type: 'any' },
    },
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all nodes grouped by category
 */
export function getNodesByCategory(): Record<string, NodeDefinition[]> {
  const categories: Record<string, NodeDefinition[]> = {
    ai: [],
    control: [],
    effects: [],
    input: [],
    output: [],
    processing: [],
  };

  for (const [key, node] of Object.entries(NODE_REGISTRY)) {
    if (node.isEnabled !== false) {
      categories[node.category].push({ ...node, type: key });
    }
  }

  return categories;
}

/**
 * Get node definition by type
 */
export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return NODE_REGISTRY[type];
}

/**
 * Validate node connections
 */
export function validateConnection(
  sourceType: string,
  sourceHandle: string,
  targetType: string,
  targetHandle: string,
): boolean {
  const sourceNode = NODE_REGISTRY[sourceType];
  const targetNode = NODE_REGISTRY[targetType];

  if (!sourceNode || !targetNode) {
    return false;
  }

  const sourceOutput = sourceNode.outputs[sourceHandle];
  const targetInput = targetNode.inputs[targetHandle];

  if (!sourceOutput || !targetInput) {
    return false;
  }

  // "any" type can connect to anything
  if (sourceOutput.type === 'any' || targetInput.type === 'any') {
    return true;
  }

  // Types must match
  return sourceOutput.type === targetInput.type;
}

/**
 * Get nodes that can connect to a specific input
 */
export function getCompatibleNodes(
  targetType: string,
  targetHandle: string,
): string[] {
  const targetNode = NODE_REGISTRY[targetType];
  if (!targetNode) {
    return [];
  }

  const targetInput = targetNode.inputs[targetHandle];
  if (!targetInput) {
    return [];
  }

  const compatible: string[] = [];

  for (const [key, node] of Object.entries(NODE_REGISTRY)) {
    for (const [_outputKey, output] of Object.entries(node.outputs)) {
      if (
        output.type === 'any' ||
        targetInput.type === 'any' ||
        output.type === targetInput.type
      ) {
        compatible.push(key);
        break;
      }
    }
  }

  return compatible;
}
