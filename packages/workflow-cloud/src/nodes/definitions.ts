import { SAAS_NODE_DEFINITIONS } from '@cloud/workflow-saas';

export const extendedNodeDefinitions = {
  captionGen: {
    category: 'distribution',
    description: 'Generate platform-optimized captions with AI',
    icon: 'MessageSquare',
    inputs: [
      { id: 'context', label: 'Context', required: true, type: 'text' },
      { id: 'media', label: 'Media', type: 'image' },
    ],
    label: 'Caption Generator',
    outputs: [{ id: 'caption', label: 'Caption', type: 'text' }],
    type: 'captionGen',
  },
  clipSelector: {
    category: 'repurposing',
    description: 'Automatically identify best clips from long videos',
    icon: 'Scissors',
    inputs: [
      { id: 'video', label: 'Video', required: true, type: 'video' },
      { id: 'transcript', label: 'Transcript', required: true, type: 'text' },
    ],
    label: 'AI Clip Selector',
    outputs: [{ id: 'clips', label: 'Clip Timestamps', type: 'text' }],
    type: 'clipSelector',
  },
  colorGrade: {
    category: 'effects',
    description:
      'Apply Instagram-style color grading (warm, cool, moody, bright)',
    icon: 'Palette',
    inputs: [{ id: 'image', label: 'Image', required: true, type: 'image' }],
    label: 'Color Grade',
    outputs: [{ id: 'image', label: 'Graded Image', type: 'image' }],
    type: 'colorGrade',
  },
  platformExport: {
    category: 'distribution',
    description:
      'Export media with platform-specific encoding (TikTok, Reels, Shorts, etc.)',
    icon: 'Download',
    inputs: [{ id: 'media', label: 'Media', required: true, type: 'image' }],
    label: 'Platform Export',
    outputs: [{ id: 'media', label: 'Exported Media', type: 'video' }],
    type: 'platformExport',
  },
  platformMultiplier: {
    category: 'repurposing',
    description: 'Create multiple platform-specific versions from one video',
    icon: 'Copy',
    inputs: [{ id: 'media', label: 'Media', required: true, type: 'video' }],
    label: 'Platform Multiplier',
    outputs: [
      { id: 'tiktok', label: 'TikTok', type: 'video' },
      { id: 'reels', label: 'Reels', type: 'video' },
      { id: 'shorts', label: 'Shorts', type: 'video' },
      { id: 'twitter', label: 'X/Twitter', type: 'video' },
    ],
    type: 'platformMultiplier',
  },
  reviewGate: {
    category: 'automation',
    description: 'Pause workflow for human approval before continuing',
    icon: 'ShieldCheck',
    inputs: [
      { id: 'media', label: 'Media', required: true, type: 'image' },
      { id: 'caption', label: 'Caption', type: 'text' },
    ],
    label: 'Review Gate',
    outputs: [
      { id: 'media', label: 'Approved Media', type: 'image' },
      { id: 'caption', label: 'Approved Caption', type: 'text' },
    ],
    type: 'reviewGate',
  },
  webhookTrigger: {
    category: 'automation',
    description: 'Trigger workflow from external tools via webhook URL',
    icon: 'Webhook',
    inputs: [],
    label: 'Webhook Trigger',
    outputs: [{ id: 'payload', label: 'Payload', type: 'text' }],
    type: 'webhookTrigger',
  },
} as const;

export const saasNodeDefinitions = SAAS_NODE_DEFINITIONS;
