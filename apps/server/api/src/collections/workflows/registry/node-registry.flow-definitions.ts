import type { NodeDefinition } from '@api/collections/workflows/registry/node-registry';

export const FLOW_NODE_DEFINITIONS: Record<string, NodeDefinition> = {
  'control-branch': {
    category: 'control',
    configSchema: {
      customField: {
        description: 'Dot-notation path when field is "custom"',
        label: 'Custom Field Path',
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
          'isTrue',
          'isFalse',
          'isEmpty',
          'isNotEmpty',
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
    icon: 'SlidersHorizontal',
    inputs: {
      value: { label: 'Value', type: 'any' },
    },
    label: 'Conditional Branch',
    outputs: {
      false: { label: 'If False', type: 'any' },
      true: { label: 'If True', type: 'any' },
    },
  },

  reviewGate: {
    category: 'control',
    configSchema: {
      autoApproveIfNoResponse: {
        default: false,
        description: 'Auto-approve if no reviewer response before timeout',
        label: 'Auto-approve On Timeout',
        type: 'boolean',
      },
      notifyChannels: {
        description: 'Channels to notify for pending review (e.g. task-inbox)',
        label: 'Notify Channels',
        type: 'string',
      },
      notifyEmail: {
        description: 'Reviewer email address for the email notify channel',
        label: 'Notify Email',
        type: 'string',
      },
      requireApproval: {
        default: true,
        description: 'Pause execution until a reviewer approves or rejects',
        label: 'Require Approval',
        type: 'boolean',
      },
      slackChannel: {
        description:
          'Slack channel for the slack notify channel (e.g. #content-review)',
        label: 'Slack Channel',
        type: 'string',
      },
      timeoutHours: {
        default: 24,
        description: 'Hours to wait for reviewer response before timeout',
        label: 'Timeout (hours)',
        type: 'number',
      },
      webhookUrl: {
        description: 'Webhook URL to POST pending-review notifications to',
        label: 'Webhook URL',
        type: 'string',
      },
    },
    description:
      'Pause the workflow for human review/approval of upstream media and caption before continuing',
    icon: 'ClipboardCheck',
    inputs: {
      caption: { label: 'Caption', type: 'text' },
      media: { label: 'Media', type: 'any' },
    },
    label: 'Review Gate',
    outputs: {
      outputCaption: { label: 'Approved Caption', type: 'text' },
      outputMedia: { label: 'Approved Media', type: 'any' },
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
        options: ['fixed', 'until'],
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
    icon: 'Clock',
    inputs: {
      trigger: { label: 'Trigger', type: 'any' },
    },
    label: 'Delay',
    outputs: {
      trigger: { label: 'Continue', type: 'any' },
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
    icon: 'Languages',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Add Captions',
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
    icon: 'Palette',
    inputs: {
      image: { label: 'Image', type: 'image' },
    },
    isPremium: false,
    label: 'Color Grade',
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
    icon: 'Sparkles',
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
    icon: 'Sparkles',
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
    icon: 'Columns2',
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
    icon: 'Pencil',
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
    icon: 'ShieldCheck',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Add Watermark',
    outputs: {
      video: { label: 'Watermarked Video', type: 'video' },
    },
  },
};
