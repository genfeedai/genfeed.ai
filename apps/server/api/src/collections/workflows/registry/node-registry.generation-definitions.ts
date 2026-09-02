import type { NodeDefinition } from '@api/collections/workflows/registry/node-registry';
import {
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  SELECTABLE_AGENT_CHAT_MODELS,
} from '@genfeedai/constants';

export const SOURCE_CORPUS_CONFIG_LIMITS = {
  days: { default: 7, max: 30, min: 1 },
  limit: { default: 50, max: 100, min: 1 },
} as const;

export const GENERATION_NODE_DEFINITIONS: Record<string, NodeDefinition> = {
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
    icon: 'Video',
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
  talkingHeadScript: {
    category: 'ai',
    configSchema: {
      brandVoice: {
        description: 'Optional brand voice and tone guidance',
        label: 'Brand Voice',
        type: 'string',
      },
      clipCount: {
        default: 5,
        description: 'Number of timed talking-head clips',
        label: 'Clip Count',
        max: 20,
        min: 2,
        type: 'number',
      },
      durationSeconds: {
        default: 30,
        description: 'Total spoken duration across all clips',
        label: 'Duration (seconds)',
        max: 300,
        min: 1,
        type: 'number',
      },
      harnessContext: {
        description: 'Optional serialized brand harness constraints',
        label: 'Harness Context',
        type: 'string',
      },
      language: {
        default: 'en',
        description: 'BCP 47 spoken-language tag',
        label: 'Language',
        type: 'string',
      },
      productContext: {
        description: 'Product, offer, audience, and proof context',
        label: 'Product Context',
        required: true,
        type: 'string',
      },
      wordsPerSecond: {
        default: 3.5,
        description: 'Spoken pacing budget for the selected voice/language',
        label: 'Words per Second',
        max: 6,
        min: 1,
        type: 'number',
      },
    },
    description:
      'Generate a duration-accurate talking-head script with hook-first, CTA-last clip segments',
    icon: 'FileText',
    inputs: {
      brandVoice: { label: 'Brand Voice', required: false, type: 'text' },
      clipCount: { label: 'Clip Count', required: false, type: 'number' },
      durationSeconds: {
        label: 'Duration (seconds)',
        required: false,
        type: 'number',
      },
      harnessContext: {
        label: 'Harness Context',
        required: false,
        type: 'any',
      },
      language: { label: 'Language', required: false, type: 'text' },
      productContext: {
        label: 'Product Context',
        required: true,
        type: 'text',
      },
      wordsPerSecond: {
        label: 'Words per Second',
        required: false,
        type: 'number',
      },
    },
    isPremium: true,
    label: 'Talking-head Script',
    outputs: {
      clipCount: { label: 'Clip Count', type: 'number' },
      fullText: { label: 'Full Script', type: 'text' },
      script: { label: 'Timed Script', type: 'any' },
      segments: { label: 'Segments', type: 'any' },
      totalDurationSeconds: {
        label: 'Total Duration (seconds)',
        type: 'number',
      },
      totalTargetWordCount: { label: 'Target Words', type: 'number' },
      totalWordCount: { label: 'Actual Words', type: 'number' },
      wordsPerSecond: { label: 'Words per Second', type: 'number' },
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
    icon: 'Sparkles',
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
    icon: 'Sparkles',
    inputs: {
      image: { label: 'Source Image', required: false, type: 'image' },
      prompt: { label: 'Prompt', type: 'text' },
    },
    label: 'Generate Image',
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
    icon: 'Mail',
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
      platform: {
        description: 'Optional connected social platform for the draft',
        label: 'Platform',
        options: ['twitter', 'instagram', 'tiktok', 'youtube'],
        type: 'select',
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
    icon: 'MessageSquare',
    inputs: {},
    label: 'Generate Post',
    outputs: {
      post: { label: 'Generated Post', type: 'any' },
    },
  },

  'source-corpus': {
    category: 'input',
    configSchema: {
      brandId: {
        description: 'Brand ID used to scope followed source posts',
        label: 'Brand ID',
        required: true,
        type: 'string',
      },
      days: {
        default: SOURCE_CORPUS_CONFIG_LIMITS.days.default,
        label: 'Days',
        max: SOURCE_CORPUS_CONFIG_LIMITS.days.max,
        min: SOURCE_CORPUS_CONFIG_LIMITS.days.min,
        type: 'number',
      },
      limit: {
        default: SOURCE_CORPUS_CONFIG_LIMITS.limit.default,
        label: 'Post Limit',
        max: SOURCE_CORPUS_CONFIG_LIMITS.limit.max,
        min: SOURCE_CORPUS_CONFIG_LIMITS.limit.min,
        type: 'number',
      },
    },
    description: 'Collect recent posts from followed brand sources',
    icon: 'Inbox',
    inputs: {},
    label: 'Source Corpus',
    outputs: {
      corpus: { label: 'Corpus', type: 'text' },
      count: { label: 'Post Count', type: 'number' },
      posts: { label: 'Source Posts', multiple: true, type: 'any' },
    },
  },

  'attach-post-ingredient': {
    category: 'output',
    configSchema: {
      brandId: {
        description: 'Brand ID used to scope the post draft',
        label: 'Brand ID',
        required: true,
        type: 'string',
      },
    },
    description: 'Attach a generated ingredient to an existing post draft',
    icon: 'Paperclip',
    inputs: {
      ingredientId: { label: 'Ingredient ID', required: true, type: 'text' },
      postId: { label: 'Post ID', required: true, type: 'text' },
    },
    label: 'Attach Ingredient',
    outputs: {
      post: { label: 'Updated Post', type: 'any' },
      status: { label: 'Status', type: 'text' },
    },
  },

  'analytics-feedback': {
    category: 'input',
    configSchema: {
      brandId: {
        description: 'Optional brand ID used to scope analytics feedback',
        label: 'Brand ID',
        type: 'string',
      },
      topN: {
        default: 5,
        description: 'Number of top-performing patterns to return',
        label: 'Top Items',
        min: 1,
        type: 'number',
      },
      worstN: {
        default: 5,
        description: 'Number of under-performing patterns to return',
        label: 'Worst Items',
        min: 1,
        type: 'number',
      },
    },
    description: 'Read performance analytics to guide content strategy',
    icon: 'ChartColumn',
    inputs: {},
    isPremium: true,
    label: 'Analytics Feedback',
    outputs: {
      avgEngagementRate: { label: 'Avg Engagement Rate', type: 'number' },
      bestPlatform: { label: 'Best Platform', type: 'text' },
      bestPostingTimes: { label: 'Best Posting Times', type: 'any' },
      topHooks: { label: 'Top Hooks', multiple: true, type: 'text' },
      topTopics: { label: 'Top Topics', multiple: true, type: 'text' },
      weekOverWeekChange: { label: 'Week-over-Week Change %', type: 'number' },
      weekOverWeekDirection: {
        label: 'Week-over-Week Direction',
        type: 'text',
      },
      worstTopics: { label: 'Worst Topics', multiple: true, type: 'text' },
      releaseEvidence: { label: 'Release Evidence', type: 'any' },
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
    icon: 'Video',
    inputs: {
      image: { label: 'Reference Image', required: false, type: 'image' },
      prompt: { label: 'Prompt', type: 'text' },
    },
    isPremium: true,
    label: 'Generate Video',
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
    icon: 'Video',
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
        // Same catalogue the agent picker and the biller read, so a workflow
        // node can never be pinned to a model we no longer run or price.
        default: DEFAULT_AGENT_CHAT_MODEL_KEY,
        description: 'LLM model to use for generation',
        label: 'Model',
        options: SELECTABLE_AGENT_CHAT_MODELS.map((model) => model.key),
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
    icon: 'Sparkles',
    inputs: {
      prompt: { label: 'Prompt', type: 'text' },
    },
    isPremium: false,
    label: 'LLM',
    outputs: {
      content: { label: 'Content', type: 'text' },
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
    icon: 'FileText',
    inputs: {
      angle: { label: 'Editorial Angle', required: false, type: 'text' },
      avoid: {
        label: 'Avoid Topics',
        multiple: true,
        required: false,
        type: 'text',
      },
      brandVoice: { label: 'Brand Voice', required: false, type: 'text' },
      cta: { label: 'CTA', required: false, type: 'text' },
      hooks: {
        label: 'Hooks',
        multiple: true,
        required: false,
        type: 'text',
      },
      listingTier: { label: 'Listing Tier', required: false, type: 'text' },
      proofPoint: { label: 'Proof Point', required: false, type: 'text' },
      propertyType: { label: 'Property Type', required: false, type: 'text' },
      roomType: { label: 'Room Type', required: false, type: 'text' },
      stylePreset: { label: 'Style Preset', required: false, type: 'text' },
      targetSpace: { label: 'Target Space', required: false, type: 'text' },
      topic: { label: 'Topic', required: false, type: 'text' },
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
    icon: 'Maximize2',
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
    icon: 'Volume2',
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
    icon: 'Mic',
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
    icon: 'Maximize2',
    inputs: {
      media: { label: 'Media', type: 'any' },
    },
    isPremium: true,
    label: 'AI Upscale',
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
    icon: 'Mic',
    inputs: {
      audio: { label: 'Audio', type: 'audio' },
    },
    isPremium: true,
    label: 'Voice Change',
    outputs: {
      audio: { label: 'Changed Audio', type: 'audio' },
    },
  },
};
