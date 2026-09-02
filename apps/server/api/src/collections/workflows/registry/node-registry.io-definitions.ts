import type { NodeDefinition } from '@api/collections/workflows/registry/node-registry';

export const IO_NODE_DEFINITIONS: Record<string, NodeDefinition> = {
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
    icon: 'Image',
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
    icon: 'MessageSquare',
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
    icon: 'LayoutTemplate',
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
    icon: 'Video',
    inputs: {},
    label: 'Video Input',
    outputs: {
      video: { label: 'Video', type: 'video' },
    },
  },

  trendTrigger: {
    category: 'input',
    configSchema: {
      checkFrequency: {
        default: '1hr',
        label: 'Check Frequency',
        options: ['15min', '30min', '1hr', '6hr', '12hr', '24hr'],
        type: 'select',
      },
      excludeKeywords: {
        description: 'Comma-separated terms to exclude',
        label: 'Exclude Keywords',
        type: 'string',
      },
      keywords: {
        description: 'Comma-separated terms to match',
        label: 'Keywords',
        type: 'string',
      },
      minViralScore: {
        default: 70,
        label: 'Min Viral Score',
        max: 100,
        min: 0,
        type: 'number',
      },
      platform: {
        default: 'tiktok',
        label: 'Platform',
        options: ['tiktok', 'instagram', 'twitter', 'youtube'],
        type: 'select',
      },
      trendType: {
        default: 'video',
        label: 'Trend Type',
        options: ['topic', 'hashtag', 'sound', 'video', 'creator'],
        type: 'select',
      },
    },
    description: 'Start workflow when a new trend matches criteria',
    icon: 'TrendingUp',
    inputs: {
      keywords: {
        label: 'Keywords',
        multiple: true,
        required: false,
        type: 'text',
      },
      platform: {
        label: 'Platform',
        required: false,
        type: 'text',
      },
    },
    isPremium: true,
    label: 'Trend Trigger',
    outputs: {
      hashtags: { label: 'Hashtags', multiple: true, type: 'text' },
      platform: { label: 'Platform', type: 'text' },
      soundId: { label: 'Sound ID', type: 'text' },
      topic: { label: 'Topic', type: 'text' },
      trendId: { label: 'Trend ID', type: 'text' },
      videoUrl: { label: 'Video URL', type: 'text' },
      viralScore: { label: 'Viral Score', type: 'number' },
    },
  },

  sendEmail: {
    category: 'output',
    configSchema: {},
    description: 'Send a single email (subject + HTML body) to a recipient',
    icon: 'Mail',
    inputs: {
      html: { label: 'HTML Body', type: 'text' },
      subject: { label: 'Subject', type: 'text' },
      to: { label: 'To', type: 'text' },
    },
    label: 'Send Email',
    outputs: {
      sent: { label: 'Sent', type: 'boolean' },
    },
  },

  trendDigest: {
    category: 'processing',
    configSchema: {
      minViralScore: {
        default: 70,
        label: 'Min Viral Score',
        max: 100,
        min: 0,
        type: 'number',
      },
      topN: {
        default: 5,
        label: 'Number of Trends',
        type: 'number',
      },
    },
    description:
      'Assemble a curated daily trends digest email from the global trend corpus',
    icon: 'TrendingUp',
    inputs: {},
    isPremium: true,
    label: 'Trend Digest',
    outputs: {
      html: { label: 'HTML Body', type: 'text' },
      subject: { label: 'Subject', type: 'text' },
      to: { label: 'Recipient', type: 'text' },
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
    icon: 'Download',
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
    icon: 'Bell',
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
    icon: 'Share2',
    inputs: {
      brand: { label: 'Brand', required: false, type: 'any' },
      caption: { label: 'Caption', required: false, type: 'text' },
      media: { label: 'Media', type: 'any' },
      schedule: { label: 'Schedule', required: false, type: 'any' },
    },
    label: 'Publish to Social',
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
    icon: 'Folder',
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
    icon: 'Link2',
    inputs: {
      data: { label: 'Data', type: 'any' },
    },
    label: 'Webhook',
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
    icon: 'Archive',
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
    icon: 'Music',
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
    icon: 'Copy',
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
    icon: 'ArrowLeftRight',
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
    icon: 'ArrowLeftRight',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    label: 'Resize',
    outputs: {
      media: { label: 'Resized Media', type: 'any' },
    },
  },

  'process-reverse': {
    category: 'processing',
    configSchema: {},
    description: 'Reverse video playback',
    icon: 'RefreshCw',
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
    icon: 'Maximize2',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    label: 'Transform',
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
    icon: 'Scissors',
    inputs: {
      video: { label: 'Video', type: 'video' },
    },
    label: 'Trim Video',
    outputs: {
      video: { label: 'Trimmed Video', type: 'video' },
    },
  },
};
