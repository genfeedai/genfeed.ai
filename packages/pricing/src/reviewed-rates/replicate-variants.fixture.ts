/** Public provider schema/billingConfig captured 2026-10-05 (kling motion-control, gpt-5-structured and p-video-2 added 2026-10-27). No approvals or margins. */
export const REPLICATE_VARIANT_FIXTURES: Readonly<
  Record<
    string,
    {
      sourceUrl: string;
      inputProperties: Record<string, unknown>;
      tiers: unknown[];
    }
  >
> = {
  'google/veo-3': {
    sourceUrl: 'https://replicate.com/google/veo-3/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        enum: [4, 6, 8],
        type: 'integer',
        title: 'duration',
        default: 8,
      },
      resolution: {
        enum: ['720p', '1080p'],
        type: 'string',
        title: 'resolution',
        default: '1080p',
      },
      aspect_ratio: {
        enum: ['16:9', '9:16'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: true,
      },
      negative_prompt: {
        type: 'string',
        title: 'Negative Prompt',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'with_audio',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.40',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'without_audio',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.20',
          },
        ],
      },
    ],
  },
  'google/veo-3-fast': {
    sourceUrl: 'https://replicate.com/google/veo-3-fast/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        enum: [4, 6, 8],
        type: 'integer',
        title: 'duration',
        default: 8,
      },
      resolution: {
        enum: ['720p', '1080p'],
        type: 'string',
        title: 'resolution',
        default: '1080p',
      },
      aspect_ratio: {
        enum: ['16:9', '9:16'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: true,
      },
      negative_prompt: {
        type: 'string',
        title: 'Negative Prompt',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'with_audio',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.15',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'without_audio',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.10',
          },
        ],
      },
    ],
  },
  'google/veo-3.1': {
    sourceUrl: 'https://replicate.com/google/veo-3.1/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        enum: [4, 6, 8],
        type: 'integer',
        title: 'duration',
        default: 8,
      },
      last_frame: {
        type: 'string',
        title: 'Last Frame',
        format: 'uri',
      },
      resolution: {
        enum: ['720p', '1080p'],
        type: 'string',
        title: 'resolution',
        default: '1080p',
      },
      aspect_ratio: {
        enum: ['16:9', '9:16'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: true,
      },
      negative_prompt: {
        type: 'string',
        title: 'Negative Prompt',
      },
      reference_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Images',
        default: [],
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'with_audio',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.40',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'without_audio',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.20',
          },
        ],
      },
    ],
  },
  'google/veo-3.1-fast': {
    sourceUrl: 'https://replicate.com/google/veo-3.1-fast/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        enum: [4, 6, 8],
        type: 'integer',
        title: 'duration',
        default: 8,
      },
      last_frame: {
        type: 'string',
        title: 'Last Frame',
        format: 'uri',
      },
      resolution: {
        enum: ['720p', '1080p'],
        type: 'string',
        title: 'resolution',
        default: '1080p',
      },
      aspect_ratio: {
        enum: ['16:9', '9:16'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: true,
      },
      negative_prompt: {
        type: 'string',
        title: 'Negative Prompt',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'with_audio',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.15',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'without_audio',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.10',
          },
        ],
      },
    ],
  },
  'openai/gpt-image-1.5': {
    sourceUrl: 'https://replicate.com/openai/gpt-image-1.5/api/schema',
    inputProperties: {
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      quality: {
        enum: ['low', 'medium', 'high', 'auto'],
        type: 'string',
        title: 'quality',
        default: 'auto',
      },
      user_id: {
        type: 'string',
        title: 'User Id',
      },
      background: {
        enum: ['auto', 'transparent', 'opaque'],
        type: 'string',
        title: 'background',
        default: 'auto',
      },
      moderation: {
        enum: ['auto', 'low'],
        type: 'string',
        title: 'moderation',
        default: 'auto',
      },
      aspect_ratio: {
        enum: ['1:1', '3:2', '2:3'],
        type: 'string',
        title: 'aspect_ratio',
        default: '1:1',
      },
      input_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Input Images',
      },
      output_format: {
        enum: ['png', 'jpeg', 'webp'],
        type: 'string',
        title: 'output_format',
        default: 'webp',
      },
      input_fidelity: {
        enum: ['low', 'high'],
        type: 'string',
        title: 'input_fidelity',
        default: 'low',
      },
      openai_api_key: {
        type: 'string',
        title: 'Openai Api Key',
        format: 'password',
      },
      number_of_images: {
        type: 'integer',
        title: 'Number Of Images',
        default: 1,
        maximum: 10,
        minimum: 1,
      },
      output_compression: {
        type: 'integer',
        title: 'Output Compression',
        default: 90,
        maximum: 100,
        minimum: 0,
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'auto',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.136',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'low',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.013',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'medium',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.05',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'high',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.136',
          },
        ],
      },
    ],
  },
  'openai/gpt-image-2': {
    sourceUrl: 'https://replicate.com/openai/gpt-image-2/api/schema',
    inputProperties: {
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      quality: {
        enum: ['low', 'medium', 'high', 'auto'],
        type: 'string',
        title: 'quality',
        default: 'auto',
      },
      user_id: {
        type: 'string',
        title: 'User Id',
      },
      background: {
        enum: ['auto', 'transparent', 'opaque'],
        type: 'string',
        title: 'background',
        default: 'auto',
      },
      moderation: {
        enum: ['auto', 'low'],
        type: 'string',
        title: 'moderation',
        default: 'auto',
      },
      aspect_ratio: {
        enum: [
          '1:1',
          '3:2',
          '2:3',
          '4:3',
          '3:4',
          '16:9',
          '9:16',
          'auto',
          '1024x1024',
          '1536x1024',
          '1024x1536',
          '1536x1152',
          '1152x1536',
          '2048x2048',
          '2048x1152',
          '1152x2048',
          '3840x2160',
          '2160x3840',
        ],
        type: 'string',
        title: 'aspect_ratio',
        default: '1:1',
      },
      input_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Input Images',
      },
      output_format: {
        enum: ['png', 'jpeg', 'webp'],
        type: 'string',
        title: 'output_format',
        default: 'webp',
      },
      openai_api_key: {
        type: 'string',
        title: 'Openai Api Key',
        format: 'password',
      },
      number_of_images: {
        type: 'integer',
        title: 'Number Of Images',
        default: 1,
        maximum: 10,
        minimum: 1,
      },
      output_compression: {
        type: 'integer',
        title: 'Output Compression',
        default: 90,
        maximum: 100,
        minimum: 0,
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'auto',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.128',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'low',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.012',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'medium',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.047',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'high',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.128',
          },
        ],
      },
    ],
  },
  'openai/gpt-image-2.5-flare': {
    sourceUrl: 'https://replicate.com/openai/gpt-image-2.5-flare/api/schema',
    inputProperties: {
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      quality: {
        enum: ['low', 'medium', 'high', 'xhigh', 'max', 'auto'],
        type: 'string',
        title: 'quality',
        default: 'auto',
      },
      user_id: {
        type: 'string',
        title: 'User Id',
      },
      background: {
        enum: ['auto', 'transparent', 'opaque'],
        type: 'string',
        title: 'background',
        default: 'auto',
      },
      moderation: {
        enum: ['auto', 'low'],
        type: 'string',
        title: 'moderation',
        default: 'auto',
      },
      aspect_ratio: {
        enum: [
          '1:1',
          '3:2',
          '2:3',
          '4:3',
          '3:4',
          '16:9',
          '9:16',
          'auto',
          '1024x1024',
          '1536x1024',
          '1024x1536',
          '1536x1152',
          '1152x1536',
          '2048x2048',
          '2048x1152',
          '1152x2048',
          '3840x2160',
          '2160x3840',
        ],
        type: 'string',
        title: 'aspect_ratio',
        default: '1:1',
      },
      input_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Input Images',
      },
      output_format: {
        enum: ['png', 'jpeg', 'webp'],
        type: 'string',
        title: 'output_format',
        default: 'webp',
      },
      openai_api_key: {
        type: 'string',
        title: 'Openai Api Key',
        format: 'password',
      },
      number_of_images: {
        type: 'integer',
        title: 'Number Of Images',
        default: 1,
        maximum: 10,
        minimum: 1,
      },
      output_compression: {
        type: 'integer',
        title: 'Output Compression',
        default: 90,
        maximum: 100,
        minimum: 0,
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'auto',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.25',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'low',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.012',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'medium',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.047',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'high',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.128',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'xhigh',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.25',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'max',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.50',
          },
        ],
      },
    ],
  },
  'openai/gpt-image-2.5-sunburst': {
    sourceUrl: 'https://replicate.com/openai/gpt-image-2.5-sunburst/api/schema',
    inputProperties: {
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      quality: {
        enum: ['low', 'medium', 'high', 'xhigh', 'max', 'auto'],
        type: 'string',
        title: 'quality',
        default: 'auto',
      },
      user_id: {
        type: 'string',
        title: 'User Id',
      },
      background: {
        enum: ['auto', 'transparent', 'opaque'],
        type: 'string',
        title: 'background',
        default: 'auto',
      },
      moderation: {
        enum: ['auto', 'low'],
        type: 'string',
        title: 'moderation',
        default: 'auto',
      },
      aspect_ratio: {
        enum: [
          '1:1',
          '3:2',
          '2:3',
          '4:3',
          '3:4',
          '16:9',
          '9:16',
          'auto',
          '1024x1024',
          '1536x1024',
          '1024x1536',
          '1536x1152',
          '1152x1536',
          '2048x2048',
          '2048x1152',
          '1152x2048',
          '3840x2160',
          '2160x3840',
        ],
        type: 'string',
        title: 'aspect_ratio',
        default: '1:1',
      },
      input_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Input Images',
      },
      output_format: {
        enum: ['png', 'jpeg', 'webp'],
        type: 'string',
        title: 'output_format',
        default: 'webp',
      },
      openai_api_key: {
        type: 'string',
        title: 'Openai Api Key',
        format: 'password',
      },
      number_of_images: {
        type: 'integer',
        title: 'Number Of Images',
        default: 1,
        maximum: 10,
        minimum: 1,
      },
      output_compression: {
        type: 'integer',
        title: 'Output Compression',
        default: 90,
        maximum: 100,
        minimum: 0,
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'auto',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.25',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'low',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.012',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'medium',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.047',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'high',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.128',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'xhigh',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.25',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'max',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.50',
          },
        ],
      },
    ],
  },
  'ideogram-ai/ideogram-character': {
    sourceUrl:
      'https://replicate.com/ideogram-ai/ideogram-character/api/schema',
    inputProperties: {
      mask: {
        type: 'string',
        title: 'Mask',
        format: 'uri',
      },
      seed: {
        type: 'integer',
        title: 'Seed',
        maximum: 2147483647,
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      resolution: {
        enum: [
          'None',
          '512x1536',
          '576x1408',
          '576x1472',
          '576x1536',
          '640x1344',
          '640x1408',
          '640x1472',
          '640x1536',
          '704x1152',
          '704x1216',
          '704x1280',
          '704x1344',
          '704x1408',
          '704x1472',
          '736x1312',
          '768x1088',
          '768x1216',
          '768x1280',
          '768x1344',
          '800x1280',
          '832x960',
          '832x1024',
          '832x1088',
          '832x1152',
          '832x1216',
          '832x1248',
          '864x1152',
          '896x960',
          '896x1024',
          '896x1088',
          '896x1120',
          '896x1152',
          '960x832',
          '960x896',
          '960x1024',
          '960x1088',
          '1024x832',
          '1024x896',
          '1024x960',
          '1024x1024',
          '1088x768',
          '1088x832',
          '1088x896',
          '1088x960',
          '1120x896',
          '1152x704',
          '1152x832',
          '1152x864',
          '1152x896',
          '1216x704',
          '1216x768',
          '1216x832',
          '1248x832',
          '1280x704',
          '1280x768',
          '1280x800',
          '1312x736',
          '1344x640',
          '1344x704',
          '1344x768',
          '1408x576',
          '1408x640',
          '1408x704',
          '1472x576',
          '1472x640',
          '1472x704',
          '1536x512',
          '1536x576',
          '1536x640',
        ],
        type: 'string',
        title: 'resolution',
        default: 'None',
      },
      style_type: {
        enum: ['Auto', 'Fiction', 'Realistic'],
        type: 'string',
        title: 'style_type',
        default: 'Auto',
      },
      aspect_ratio: {
        enum: [
          '1:3',
          '3:1',
          '1:2',
          '2:1',
          '9:16',
          '16:9',
          '10:16',
          '16:10',
          '2:3',
          '3:2',
          '3:4',
          '4:3',
          '4:5',
          '5:4',
          '1:1',
        ],
        type: 'string',
        title: 'aspect_ratio',
        default: '1:1',
      },
      rendering_speed: {
        enum: ['Default', 'Turbo', 'Quality'],
        type: 'string',
        title: 'rendering_speed',
        default: 'Default',
      },
      magic_prompt_option: {
        enum: ['Auto', 'On', 'Off'],
        type: 'string',
        title: 'magic_prompt_option',
        default: 'Auto',
      },
      character_reference_image: {
        type: 'string',
        title: 'Character Reference Image',
        format: 'uri',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'TURBO',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.10',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'DEFAULT',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.15',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'QUALITY',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.20',
          },
        ],
      },
    ],
  },
  'black-forest-labs/flux-2-dev': {
    sourceUrl: 'https://replicate.com/black-forest-labs/flux-2-dev/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      width: {
        type: 'integer',
        title: 'Width',
        maximum: 1440,
        minimum: 256,
      },
      height: {
        type: 'integer',
        title: 'Height',
        maximum: 1440,
        minimum: 256,
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      go_fast: {
        type: 'boolean',
        title: 'Go Fast',
        default: true,
      },
      aspect_ratio: {
        enum: [
          'match_input_image',
          'custom',
          '1:1',
          '16:9',
          '3:2',
          '2:3',
          '4:5',
          '5:4',
          '9:16',
          '3:4',
          '4:3',
        ],
        type: 'string',
        title: 'aspect_ratio',
        default: '1:1',
      },
      input_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Input Images',
      },
      output_format: {
        enum: ['webp', 'jpg', 'png'],
        type: 'string',
        title: 'output_format',
        default: 'webp',
      },
      output_quality: {
        type: 'integer',
        title: 'Output Quality',
        default: 80,
        maximum: 100,
        minimum: 0,
      },
      disable_safety_checker: {
        type: 'boolean',
        title: 'Disable Safety Checker',
        default: false,
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'go_fast',
          },
        ],
        prices: [
          {
            metric: 'image_input_megapixel_count',
            type: 'per-unit',
            price: '$0.012',
          },
          {
            metric: 'image_output_megapixel_count',
            type: 'per-unit',
            price: '$0.012',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'regular',
          },
        ],
        prices: [
          {
            metric: 'image_input_megapixel_count',
            type: 'per-unit',
            price: '$0.014',
          },
          {
            metric: 'image_output_megapixel_count',
            type: 'per-unit',
            price: '$0.014',
          },
        ],
      },
    ],
  },
  'bytedance/seedance-2.0': {
    sourceUrl: 'https://replicate.com/bytedance/seedance-2.0/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        type: 'integer',
        title: 'Duration',
        default: 5,
        maximum: 15,
        minimum: -1,
      },
      resolution: {
        enum: ['480p', '720p', '1080p', '4k'],
        type: 'string',
        title: 'resolution',
        default: '720p',
      },
      aspect_ratio: {
        enum: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', '9:21', 'adaptive'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: true,
      },
      last_frame_image: {
        type: 'string',
        title: 'Last Frame Image',
        format: 'uri',
      },
      reference_audios: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Audios',
        default: [],
      },
      reference_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Images',
        default: [],
      },
      reference_videos: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Videos',
        default: [],
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '480p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.10',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'non_video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '480p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.08',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.22',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'non_video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.18',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '1080p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.55',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'non_video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '1080p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.45',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '4k',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$1.25',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'non_video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '4k',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$1',
          },
        ],
      },
    ],
  },
  'bytedance/seedance-2.0-fast': {
    sourceUrl: 'https://replicate.com/bytedance/seedance-2.0-fast/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        type: 'integer',
        title: 'Duration',
        default: 5,
        maximum: 15,
        minimum: -1,
      },
      resolution: {
        enum: ['480p', '720p'],
        type: 'string',
        title: 'resolution',
        default: '720p',
      },
      aspect_ratio: {
        enum: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', '9:21', 'adaptive'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: true,
      },
      last_frame_image: {
        type: 'string',
        title: 'Last Frame Image',
        format: 'uri',
      },
      reference_audios: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Audios',
        default: [],
      },
      reference_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Images',
        default: [],
      },
      reference_videos: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Videos',
        default: [],
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '480p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.08',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'non_video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '480p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.07',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.17',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'non_video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.15',
          },
        ],
      },
    ],
  },
  'bytedance/seedance-2.5': {
    sourceUrl: 'https://replicate.com/bytedance/seedance-2.5/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
        default: '',
      },
      duration: {
        type: 'integer',
        title: 'Duration',
        default: 5,
        maximum: 30,
        minimum: -1,
      },
      watermark: {
        type: 'boolean',
        title: 'Watermark',
        default: false,
      },
      resolution: {
        enum: ['480p', '720p'],
        type: 'string',
        title: 'resolution',
        default: '720p',
      },
      aspect_ratio: {
        enum: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      output_format: {
        enum: ['mp4', 'mov'],
        type: 'string',
        title: 'output_format',
        default: 'mp4',
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: true,
      },
      last_frame_image: {
        type: 'string',
        title: 'Last Frame Image',
        format: 'uri',
      },
      reference_audios: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Audios',
        default: [],
      },
      reference_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Images',
        default: [],
      },
      reference_videos: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Videos',
        default: [],
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'non_video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '480p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.1028',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '480p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.4304',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'non_video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.2312',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'video_in',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.9676',
          },
        ],
      },
    ],
  },
  'kwaivgi/kling-v2.1': {
    sourceUrl: 'https://replicate.com/kwaivgi/kling-v2.1/api/schema',
    inputProperties: {
      mode: {
        enum: ['standard', 'pro'],
        type: 'string',
        title: 'mode',
        default: 'standard',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        enum: [5, 10],
        type: 'integer',
        title: 'duration',
        default: 5,
      },
      end_image: {
        type: 'string',
        title: 'End Image',
        format: 'uri',
      },
      start_image: {
        type: 'string',
        title: 'Start Image',
        format: 'uri',
      },
      negative_prompt: {
        type: 'string',
        title: 'Negative Prompt',
        default: '',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'standard',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.05',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'pro',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.09',
          },
        ],
      },
    ],
  },
  'kwaivgi/kling-v2.6': {
    sourceUrl: 'https://replicate.com/kwaivgi/kling-v2.6/api/schema',
    inputProperties: {
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        enum: [5, 10],
        type: 'integer',
        title: 'duration',
        default: 5,
      },
      start_image: {
        type: 'string',
        title: 'Start Image',
        format: 'uri',
      },
      aspect_ratio: {
        enum: ['16:9', '9:16', '1:1'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: true,
      },
      negative_prompt: {
        type: 'string',
        title: 'Negative Prompt',
        default: '',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.07',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.14',
          },
        ],
      },
    ],
  },
  'kwaivgi/kling-v3-video': {
    sourceUrl: 'https://replicate.com/kwaivgi/kling-v3-video/api/schema',
    inputProperties: {
      mode: {
        enum: ['standard', 'pro', '4k'],
        type: 'string',
        title: 'mode',
        default: 'pro',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        type: 'integer',
        title: 'Duration',
        default: 5,
        maximum: 15,
        minimum: 3,
      },
      end_image: {
        type: 'string',
        title: 'End Image',
        format: 'uri',
      },
      start_image: {
        type: 'string',
        title: 'Start Image',
        format: 'uri',
      },
      aspect_ratio: {
        enum: ['16:9', '9:16', '1:1'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      multi_prompt: {
        type: 'string',
        title: 'Multi Prompt',
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: false,
      },
      negative_prompt: {
        type: 'string',
        title: 'Negative Prompt',
        default: '',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'standard',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.168',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'standard',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.252',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'pro',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.224',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'pro',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.336',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: '4k',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.42',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: '4k',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.42',
          },
        ],
      },
    ],
  },
  'kwaivgi/kling-v3-omni-video': {
    sourceUrl: 'https://replicate.com/kwaivgi/kling-v3-omni-video/api/schema',
    inputProperties: {
      mode: {
        enum: ['standard', 'pro', '4k'],
        type: 'string',
        title: 'mode',
        default: 'pro',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        type: 'integer',
        title: 'Duration',
        default: 5,
        maximum: 15,
        minimum: 3,
      },
      end_image: {
        type: 'string',
        title: 'End Image',
        format: 'uri',
      },
      start_image: {
        type: 'string',
        title: 'Start Image',
        format: 'uri',
      },
      aspect_ratio: {
        enum: ['16:9', '9:16', '1:1'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      multi_prompt: {
        type: 'string',
        title: 'Multi Prompt',
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: false,
      },
      reference_video: {
        type: 'string',
        title: 'Reference Video',
        format: 'uri',
      },
      reference_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Images',
      },
      keep_original_sound: {
        type: 'boolean',
        title: 'Keep Original Sound',
        default: true,
      },
      video_reference_type: {
        enum: ['feature', 'base'],
        type: 'string',
        title: 'video_reference_type',
        default: 'feature',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'standard',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.168',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'standard',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.224',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'pro',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.224',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'pro',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.28',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: '4k',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.42',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: '4k',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.42',
          },
        ],
      },
    ],
  },
  'kwaivgi/kling-avatar-v2': {
    sourceUrl: 'https://replicate.com/kwaivgi/kling-avatar-v2/api/schema',
    inputProperties: {
      mode: {
        enum: ['std', 'pro'],
        type: 'string',
        title: 'mode',
        default: 'std',
      },
      audio: {
        type: 'string',
        title: 'Audio',
        format: 'uri',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'std',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.056',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'pro',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.11',
          },
        ],
      },
    ],
  },
  'luma/reframe-image': {
    sourceUrl: 'https://replicate.com/luma/reframe-image/api/schema',
    inputProperties: {
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      model: {
        enum: ['photon-flash-1', 'photon-1'],
        type: 'string',
        title: 'model',
        default: 'photon-flash-1',
      },
      x_end: {
        type: 'integer',
        title: 'X End',
      },
      y_end: {
        type: 'integer',
        title: 'Y End',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      x_start: {
        type: 'integer',
        title: 'X Start',
      },
      y_start: {
        type: 'integer',
        title: 'Y Start',
      },
      image_url: {
        type: 'string',
        title: 'Image Url',
      },
      aspect_ratio: {
        enum: ['1:1', '3:4', '4:3', '9:16', '16:9', '9:21', '21:9'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      grid_position_x: {
        type: 'integer',
        title: 'Grid Position X',
      },
      grid_position_y: {
        type: 'integer',
        title: 'Grid Position Y',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'photon-flash-1',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.01',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'photon-1',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.03',
          },
        ],
      },
    ],
  },
  'prunaai/p-video': {
    sourceUrl: 'https://replicate.com/prunaai/p-video/api/schema',
    inputProperties: {
      fps: {
        enum: [24, 48],
        type: 'integer',
        title: 'fps',
        default: 24,
      },
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      audio: {
        type: 'string',
        title: 'Audio',
        format: 'uri',
      },
      draft: {
        type: 'boolean',
        title: 'Draft',
        default: false,
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      no_op: {
        type: 'boolean',
        title: 'No Op',
        default: false,
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        type: 'integer',
        title: 'Duration',
        default: 5,
        maximum: 20,
        minimum: 1,
      },
      resolution: {
        enum: ['720p', '1080p'],
        type: 'string',
        title: 'resolution',
        default: '720p',
      },
      save_audio: {
        type: 'boolean',
        title: 'Save Audio',
        default: true,
      },
      aspect_ratio: {
        enum: ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      last_frame_image: {
        type: 'string',
        title: 'Last Frame Image',
        format: 'uri',
      },
      prompt_upsampling: {
        type: 'boolean',
        title: 'Prompt Upsampling',
        default: true,
      },
      disable_safety_filter: {
        type: 'boolean',
        title: 'Disable Safety Filter',
        default: true,
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'base',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.02',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'draft',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.005',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'base',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '1080p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.04',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'draft',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '1080p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.01',
          },
        ],
      },
    ],
  },
  'wan-video/wan-2.2-i2v-fast': {
    sourceUrl: 'https://replicate.com/wan-video/wan-2.2-i2v-fast/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      go_fast: {
        type: 'boolean',
        title: 'Go Fast',
        default: true,
      },
      last_image: {
        type: 'string',
        title: 'Last Image',
        format: 'uri',
      },
      num_frames: {
        type: 'integer',
        title: 'Num Frames',
        default: 81,
        maximum: 121,
        minimum: 81,
      },
      resolution: {
        enum: ['480p', '720p'],
        type: 'string',
        title: 'resolution',
        default: '480p',
      },
      sample_shift: {
        type: 'number',
        title: 'Sample Shift',
        default: 12,
        maximum: 20,
        minimum: 1,
      },
      frames_per_second: {
        type: 'integer',
        title: 'Frames Per Second',
        default: 16,
        maximum: 30,
        minimum: 5,
      },
      interpolate_output: {
        type: 'boolean',
        title: 'Interpolate Output',
        default: false,
      },
      disable_safety_checker: {
        type: 'boolean',
        title: 'Disable Safety Checker',
        default: false,
      },
      lora_scale_transformer: {
        type: 'number',
        title: 'Lora Scale Transformer',
        default: 1,
      },
      lora_scale_transformer_2: {
        type: 'number',
        title: 'Lora Scale Transformer 2',
        default: 1,
      },
      lora_weights_transformer: {
        type: 'string',
        title: 'Lora Weights Transformer',
      },
      lora_weights_transformer_2: {
        type: 'string',
        title: 'Lora Weights Transformer 2',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'base',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '480p',
          },
        ],
        prices: [
          {
            metric: 'video_output_count',
            type: 'per-unit',
            price: '$0.05',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'interpolate',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '480p',
          },
        ],
        prices: [
          {
            metric: 'video_output_count',
            type: 'per-unit',
            price: '$0.065',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'base',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_count',
            type: 'per-unit',
            price: '$0.11',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'interpolate',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_count',
            type: 'per-unit',
            price: '$0.145',
          },
        ],
      },
    ],
  },
  'pixverse/pixverse-v6': {
    sourceUrl: 'https://replicate.com/pixverse/pixverse-v6/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      quality: {
        enum: ['360p', '540p', '720p', '1080p'],
        type: 'string',
        title: 'quality',
        default: '540p',
      },
      duration: {
        enum: [5, 8, 10, 15],
        type: 'integer',
        title: 'duration',
        default: 5,
      },
      aspect_ratio: {
        enum: ['16:9', '9:16', '1:1'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      negative_prompt: {
        type: 'string',
        title: 'Negative Prompt',
        default: '',
      },
      last_frame_image: {
        type: 'string',
        title: 'Last Frame Image',
        format: 'uri',
      },
      generate_audio_switch: {
        type: 'boolean',
        title: 'Generate Audio Switch',
        default: false,
      },
      generate_multi_clip_switch: {
        type: 'boolean',
        title: 'Generate Multi Clip Switch',
        default: false,
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '360p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.05',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '360p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.07',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '540p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.07',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '540p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.09',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.09',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.12',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: false,
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '1080p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.18',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'with audio',
            type: 'equals',
            subtype: 'boolean',
            value: true,
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '1080p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.23',
          },
        ],
      },
    ],
  },
  'ideogram-ai/ideogram-4-5': {
    sourceUrl: 'https://replicate.com/ideogram-ai/ideogram-4-5/api/schema',
    inputProperties: {
      mask: {
        type: 'string',
        title: 'Mask',
        format: 'uri',
      },
      seed: {
        type: 'integer',
        title: 'Seed',
        maximum: 2147483647,
      },
      size: {
        enum: [
          'source',
          '1024x1024',
          '1280x896',
          '896x1280',
          '1344x768',
          '768x1344',
          '1536x640',
          '640x1536',
        ],
        type: 'string',
        title: 'size',
        default: 'source',
      },
      images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Images',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      quality: {
        enum: ['very_low', 'low', 'medium', 'high'],
        type: 'string',
        title: 'quality',
        default: 'medium',
      },
      num_images: {
        type: 'integer',
        title: 'Num Images',
        default: 1,
        maximum: 8,
        minimum: 1,
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'low',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.03',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'medium',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.06',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'high',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.10',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'very_low-with-source-images',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$8',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'low-with-source-images',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.03',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'medium-with-source-images',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.06',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'high-with-source-images',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            type: 'per-unit',
            price: '$0.22',
          },
        ],
      },
    ],
  },
  'kwaivgi/kling-v4.0': {
    sourceUrl: 'https://replicate.com/kwaivgi/kling-v4.0/api/schema',
    inputProperties: {
      prompt: {
        type: 'string',
        title: 'Prompt',
        'x-order': 0,
        description:
          'Text prompt describing the video. Refer to images as @image_1, @image_2, ... and videos as @video_1, @video_2, ... (see start_image and reference_images for numbering). Up to 26,000 English characters or 11,000 non-English characters.',
      },
      duration: {
        type: 'integer',
        title: 'Duration',
        default: 5,
        maximum: 30,
        minimum: 3,
        'x-order': 9,
        description:
          'Video duration in seconds. Ignored when base_video is set.',
      },
      end_image: {
        type: 'string',
        title: 'End Image',
        format: 'uri',
        'x-order': 3,
        nullable: true,
        description:
          'Last frame of the video. Same format requirements as start_image.',
      },
      base_video: {
        type: 'string',
        title: 'Base Video',
        format: 'uri',
        'x-order': 6,
        nullable: true,
        description:
          'Video to edit (.mp4/.mov, 3-30 seconds, 700-4553px per side, max 300MB). Referred to as @video_1. When set, the output keeps the length and aspect ratio of this video.',
      },
      resolution: {
        enum: ['720p', '1080p'],
        type: 'string',
        title: 'resolution',
        description: 'Output resolution.',
        default: '1080p',
        'x-order': 7,
      },
      start_image: {
        type: 'string',
        title: 'Start Image',
        format: 'uri',
        'x-order': 1,
        nullable: true,
        description:
          'First frame of the video. Supports .jpg/.jpeg/.png, max 30MB, min 300px, aspect ratio between 2:5 and 5:2.',
      },
      aspect_ratio: {
        enum: ['16:9', '9:16', '1:1', '21:9'],
        type: 'string',
        title: 'aspect_ratio',
        description:
          'Aspect ratio of the output video. Ignored when start_image, middle_images, end_image or base_video is set, since the aspect ratio then comes from the input.',
        default: '16:9',
        'x-order': 8,
      },
      middle_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Middle Images',
        default: [],
        'x-order': 2,
        description:
          'Keyframes between the first and last frame, in order. Same format requirements as start_image.',
      },
      reference_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Images',
        default: [],
        'x-order': 4,
        description:
          'Reference images for characters, objects, scenes or style. Images are numbered in this order: start_image, middle_images, end_image, reference_images. Up to 10 images in total across all image inputs.',
      },
      reference_videos: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Videos',
        default: [],
        'x-order': 5,
        description:
          'Reference videos to take motion, camera work or style from (.mp4/.mov, 3-30 seconds each, 700-4553px per side, max 300MB). Numbered after base_video.',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'no-video-input',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.157',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'no-video-input',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '1080p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.235',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'video-input',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '720p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.094',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'video-input',
          },
          {
            title: 'target resolution',
            type: 'equals',
            subtype: 'string',
            value: '1080p',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.141',
          },
        ],
      },
    ],
  },
  'kwaivgi/kling-o1': {
    sourceUrl: 'https://replicate.com/kwaivgi/kling-o1/api/schema',
    inputProperties: {
      mode: {
        enum: ['std', 'pro'],
        type: 'string',
        title: 'mode',
        default: 'pro',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
      },
      duration: {
        enum: [3, 4, 5, 6, 7, 8, 9, 10],
        type: 'integer',
        title: 'duration',
        default: 5,
      },
      end_image: {
        type: 'string',
        title: 'End Image',
        format: 'uri',
      },
      start_image: {
        type: 'string',
        title: 'Start Image',
        format: 'uri',
      },
      aspect_ratio: {
        enum: ['16:9', '9:16', '1:1'],
        type: 'string',
        title: 'aspect_ratio',
        default: '16:9',
      },
      reference_video: {
        type: 'string',
        title: 'Reference Video',
        format: 'uri',
      },
      reference_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Images',
      },
      keep_original_sound: {
        type: 'boolean',
        title: 'Keep Original Sound',
        default: true,
      },
      video_reference_type: {
        enum: ['feature', 'base'],
        type: 'string',
        title: 'video_reference_type',
        default: 'feature',
      },
    },
    tiers: [
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'std',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.084',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'std-with-video-input',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.126',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'pro',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.112',
          },
        ],
      },
      {
        criteria: [
          {
            title: 'model variant',
            type: 'equals',
            subtype: 'string',
            value: 'pro-with-video-input',
          },
        ],
        prices: [
          {
            metric: 'video_output_duration_seconds',
            type: 'per-unit',
            price: '$0.168',
          },
        ],
      },
    ],
  },
  // Provider evidence captured 2026-10-07.
  'black-forest-labs/flux-3': {
    sourceUrl: 'https://replicate.com/black-forest-labs/flux-3',
    inputProperties: {
      draft: {
        type: 'boolean',
        title: 'Draft',
        default: false,
        'x-order': 7,
        description:
          'Generate a fast, low-cost draft preview instead of a full-quality clip. Drafts are 720p.',
      },
      images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Images',
        default: [],
        'x-order': 1,
        description:
          'Optional images to drive the video, placed on screen pixel for pixel. One image opens the clip (image-to-video). Two images start and end it. Three or more (up to 10) become a storyboard — the first starts it, the last ends it, and the rest fall evenly in between (needs a duration). Leave empty for text-to-video. Must be PNG, JPEG, or WebP.',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
        'x-order': 0,
        description:
          'Text description of the video to generate. Plain language works — the prompt is interpreted and expanded before generation. Describe the scene, action, camera moves, and any audio you want.',
      },
      duration: {
        allOf: [
          {
            $ref: '#/components/schemas/duration',
          },
        ],
        default: 'auto',
        'x-order': 5,
        description:
          "Length of the generated clip in seconds. 'auto' lets the model pick to fit the content. Three or more images need an explicit duration.",
      },
      resolution: {
        allOf: [
          {
            $ref: '#/components/schemas/resolution',
          },
        ],
        default: '720p',
        'x-order': 4,
        description: 'Output resolution.',
      },
      start_video: {
        type: 'string',
        title: 'Start Video',
        format: 'uri',
        default: null,
        'x-order': 2,
        nullable: true,
        description:
          "A video to continue from its final frames. Use this to extend a shot or chain generations into a longer sequence. Must be an mp4, at most 50MB and 15 seconds. Can't be combined with images.",
      },
      aspect_ratio: {
        allOf: [
          {
            $ref: '#/components/schemas/aspect_ratio',
          },
        ],
        default: 'auto',
        'x-order': 3,
        description:
          "Aspect ratio of the generated video. 'auto' picks a ratio from your prompt and any inputs.",
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: true,
        'x-order': 6,
        description:
          'Generate synchronized audio (ambient sound, speech, effects). Set to false for a silent clip.',
      },
      safety_tolerance: {
        type: 'integer',
        title: 'Safety Tolerance',
        default: 2,
        maximum: 4,
        minimum: 0,
        'x-order': 8,
        description:
          'Moderation tolerance for input and output, 0 (strictest) to 4 (most permissive). Requests with image or video inputs are limited to 2.',
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 't2v_i2v',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 't2v_i2v',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
        ],
        description: 'Text-to-video and image-to-video at 720p',
        prices: [
          {
            description: 'or around 58 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.17',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '720p',
      },
      {
        criteria: [
          {
            description: 't2v_i2v',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 't2v_i2v',
          },
          {
            description: '1080p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '1080p',
          },
        ],
        description: 'Text-to-video and image-to-video at 1080p',
        prices: [
          {
            description: 'or around 34 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.29',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '1080p',
      },
      {
        criteria: [
          {
            description: 't2v_i2v_draft',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 't2v_i2v_draft',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
        ],
        description: 'Fast draft preview at 720p',
        prices: [
          {
            description: 'or around 16 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.06',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Draft 720p',
      },
      {
        criteria: [
          {
            description: 'v2v',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'v2v',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
        ],
        description: 'Video continuation at 720p',
        prices: [
          {
            description: 'or around 24 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.41',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Video-to-video 720p',
      },
      {
        criteria: [
          {
            description: 'v2v',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'v2v',
          },
          {
            description: '1080p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '1080p',
          },
        ],
        description: 'Video continuation at 1080p',
        prices: [
          {
            description: 'or around 18 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.53',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Video-to-video 1080p',
      },
      {
        criteria: [
          {
            description: 'v2v_draft',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'v2v_draft',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
        ],
        description: 'Fast video continuation draft at 720p',
        prices: [
          {
            description: 'or around 83 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.12',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Video-to-video draft 720p',
      },
    ],
  },
  'bytedance/seedance-2.0-mini': {
    sourceUrl: 'https://replicate.com/bytedance/seedance-2.0-mini/api/schema',
    inputProperties: {
      seed: {
        type: 'integer',
        title: 'Seed',
        default: null,
        'x-order': 10,
        nullable: true,
        description: 'Random seed. Set for reproducible generation.',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
        default: null,
        'x-order': 1,
        nullable: true,
        description:
          'Input image for image-to-video generation (first frame). Cannot be combined with reference images.',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
        'x-order': 0,
        maxLength: 4000,
        description:
          'Text prompt for video generation. Maximum 4000 characters. BytePlus recommends keeping prompts under 600 English words for best results.',
      },
      duration: {
        type: 'integer',
        title: 'Duration',
        default: 5,
        maximum: 15,
        minimum: -1,
        'x-order': 6,
        description:
          'Video duration in seconds. Set to -1 for intelligent duration (model picks the best length).',
      },
      resolution: {
        allOf: [
          {
            $ref: '#/components/schemas/resolution',
          },
        ],
        default: '720p',
        'x-order': 7,
        description: 'Video resolution.',
      },
      aspect_ratio: {
        allOf: [
          {
            $ref: '#/components/schemas/aspect_ratio',
          },
        ],
        default: '16:9',
        'x-order': 8,
        description:
          "Video aspect ratio. Set to 'adaptive' to let the model choose the best ratio based on inputs.",
      },
      generate_audio: {
        type: 'boolean',
        title: 'Generate Audio',
        default: true,
        'x-order': 9,
        description:
          'Generate synchronized audio with the video, including dialogue (use double quotes in prompt), sound effects, and background music.',
      },
      last_frame_image: {
        type: 'string',
        title: 'Last Frame Image',
        format: 'uri',
        default: null,
        'x-order': 2,
        nullable: true,
        description:
          'Input image for last frame generation. Only works if a first frame image is also provided. Cannot be combined with reference images.',
      },
      reference_audios: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Audios',
        default: [],
        'x-order': 5,
        description:
          'Reference audio files (up to 3, total duration max 15s) for audio-driven generation and lip-sync. Requires at least one reference image or video. Reference them in your prompt as [Audio1], [Audio2], etc.',
      },
      reference_images: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Images',
        default: [],
        'x-order': 3,
        description:
          'Reference images (up to 9) for character consistency, style guidance, and scene composition. Cannot be used together with first/last frame images. You can reference them in your prompt as [Image1], [Image2], etc.',
      },
      reference_videos: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Reference Videos',
        default: [],
        'x-order': 4,
        description:
          'Reference videos (up to 3, total duration max 15s) for motion transfer, style reference, and editing. Reference them in your prompt as [Video1], [Video2], etc.',
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 'video_in',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'video_in',
          },
          {
            description: '480p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '480p',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or 20 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.05',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: null,
      },
      {
        criteria: [
          {
            description: 'non_video_in',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'non_video_in',
          },
          {
            description: '480p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '480p',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or 25 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.04',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: null,
      },
      {
        criteria: [
          {
            description: 'video_in',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'video_in',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or around 90 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.11',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: null,
      },
      {
        criteria: [
          {
            description: 'non_video_in',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'non_video_in',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or around 11 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.09',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: null,
      },
    ],
  },
  // Captured 2026-10-15; `size` enum resolved from components.schemas.
  'bytedance/seedream-5-pro': {
    sourceUrl: 'https://replicate.com/bytedance/seedream-5-pro',
    inputProperties: {
      prompt: { type: 'string', title: 'Prompt', default: '' },
      image_input: {
        type: 'array',
        items: { type: 'string', format: 'uri' },
        title: 'Image Input',
        default: [],
      },
      layer_decomposition: {
        type: 'boolean',
        title: 'Layer Decomposition',
        default: false,
      },
      size: {
        enum: ['1K', '1.5K', '2K', 'auto'],
        type: 'string',
        title: 'size',
        default: '2K',
      },
      output_format: {
        enum: ['png', 'jpeg'],
        type: 'string',
        title: 'output_format',
        default: 'png',
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 'none',
            subtype: 'null',
            title: 'model variant',
            type: 'equals',
            value: null,
          },
          {
            description: '1K',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '1K',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            price: '$0.045',
            title: 'per output image',
            type: 'per-unit',
          },
        ],
      },
      {
        criteria: [
          {
            description: 'none',
            subtype: 'null',
            title: 'model variant',
            type: 'equals',
            value: null,
          },
          {
            description: '2K',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '2K',
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            price: '$0.09',
            title: 'per output image',
            type: 'per-unit',
          },
        ],
      },
      {
        criteria: [
          {
            description: 'layer-small',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'layer-small',
          },
          {
            description: 'none',
            subtype: 'null',
            title: 'target resolution',
            type: 'equals',
            value: null,
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            price: '$0.0225',
            title: 'per output image',
            type: 'per-unit',
          },
        ],
      },
      {
        criteria: [
          {
            description: 'layer-large',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'layer-large',
          },
          {
            description: 'none',
            subtype: 'null',
            title: 'target resolution',
            type: 'equals',
            value: null,
          },
        ],
        prices: [
          {
            metric: 'image_output_count',
            price: '$0.045',
            title: 'per output image',
            type: 'per-unit',
          },
        ],
      },
    ],
  },
  'kwaivgi/kling-v2.6-motion-control': {
    sourceUrl:
      'https://replicate.com/kwaivgi/kling-v2.6-motion-control/api/schema',
    inputProperties: {
      mode: {
        enum: ['std', 'pro'],
        type: 'string',
        title: 'mode',
        description:
          "Video generation mode. 'std': Standard mode (cost-effective). 'pro': Professional mode (higher quality).",
        $ref: '#/components/schemas/mode',
        allOf: [
          {
            $ref: '#/components/schemas/mode',
          },
        ],
        default: 'std',
        'x-order': 4,
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
        'x-order': 1,
        description:
          'Reference image. The characters, backgrounds, and other elements in the generated video are based on the reference image. Supports .jpg/.jpeg/.png, max 10MB, dimensions 340px-3850px, aspect ratio 1:2.5 to 2.5:1.',
      },
      video: {
        type: 'string',
        title: 'Video',
        format: 'uri',
        'x-order': 2,
        description:
          'Reference video. The character actions in the generated video are consistent with the reference video. Supports .mp4/.mov, max 100MB, 3-30 seconds duration depending on character_orientation.',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
        default: '',
        'x-order': 0,
        description:
          'Text prompt for video generation. You can add elements to the screen and achieve motion effects through prompt words.',
      },
      keep_original_sound: {
        type: 'boolean',
        title: 'Keep Original Sound',
        default: true,
        'x-order': 5,
        description: 'Whether to keep the original sound of the video',
      },
      character_orientation: {
        enum: ['image', 'video'],
        type: 'string',
        title: 'character_orientation',
        description:
          "Generate the orientation of the characters in the video. 'image': same orientation as the person in the picture (max 10s video). 'video': consistent with the orientation of the characters in the video (max 30s video).",
        $ref: '#/components/schemas/character_orientation',
        allOf: [
          {
            $ref: '#/components/schemas/character_orientation',
          },
        ],
        default: 'image',
        'x-order': 3,
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 'std',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'std',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or around 14 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.07',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'std',
      },
      {
        criteria: [
          {
            description: 'pro',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'pro',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or around 83 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.12',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'pro',
      },
    ],
  },
  'kwaivgi/kling-v3-motion-control': {
    sourceUrl:
      'https://replicate.com/kwaivgi/kling-v3-motion-control/api/schema',
    inputProperties: {
      mode: {
        enum: ['std', 'pro'],
        type: 'string',
        title: 'mode',
        description:
          "Video generation mode. 'std': Standard mode (720p, cost-effective). 'pro': Professional mode (1080p, higher quality).",
        $ref: '#/components/schemas/mode',
        allOf: [
          {
            $ref: '#/components/schemas/mode',
          },
        ],
        default: 'pro',
        'x-order': 4,
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
        'x-order': 1,
        description:
          'Reference image. The characters, backgrounds, and other elements in the generated video are based on the reference image. Supports .jpg/.jpeg/.png, max 10MB, dimensions 340px-3850px, aspect ratio 1:2.5 to 2.5:1.',
      },
      video: {
        type: 'string',
        title: 'Video',
        format: 'uri',
        'x-order': 2,
        description:
          'Reference video. The character actions in the generated video are consistent with the reference video. Supports .mp4/.mov, max 100MB, 3-30 seconds duration depending on character_orientation.',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
        default: '',
        'x-order': 0,
        description:
          'Text prompt for video generation. You can add elements to the screen and achieve motion effects through prompt words.',
      },
      keep_original_sound: {
        type: 'boolean',
        title: 'Keep Original Sound',
        default: true,
        'x-order': 5,
        description:
          'Whether to keep the original sound of the reference video',
      },
      character_orientation: {
        enum: ['image', 'video'],
        type: 'string',
        title: 'character_orientation',
        description:
          "Orientation of the character in the generated video. 'image': same orientation as the person in the picture (max 10s video). 'video': consistent with the orientation of the characters in the video (max 30s video). When binding elements, only 'video' orientation is supported.",
        $ref: '#/components/schemas/character_orientation',
        allOf: [
          {
            $ref: '#/components/schemas/character_orientation',
          },
        ],
        default: 'image',
        'x-order': 3,
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 'std',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'std',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or around 14 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.07',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: null,
      },
      {
        criteria: [
          {
            description: 'pro',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'pro',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or around 83 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.12',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: null,
      },
    ],
  },
  'openai/gpt-5-structured': {
    sourceUrl: 'https://replicate.com/openai/gpt-5-structured/api/schema',
    inputProperties: {
      model: {
        enum: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
        type: 'string',
        title: 'model',
        description: 'GPT-5 model to use.',
        $ref: '#/components/schemas/model',
        allOf: [
          {
            $ref: '#/components/schemas/model',
          },
        ],
        default: 'gpt-5',
        'x-order': 0,
      },
      tools: {
        type: 'array',
        items: {
          type: 'object',
        },
        title: 'Tools',
        default: [],
        'x-order': 10,
        description:
          'Tools to make available to the model. Should be a JSON object containing a list of tool definitions.',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
        'x-order': 1,
        nullable: true,
        description:
          'A simple text input to the model, equivalent to a text input with the user role. Ignored if input_item_list is provided.',
      },
      verbosity: {
        enum: ['low', 'medium', 'high'],
        type: 'string',
        title: 'verbosity',
        description:
          "Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. GPT-5 supports this parameter to help control whether answers are short and to the point or long and comprehensive.",
        $ref: '#/components/schemas/verbosity',
        allOf: [
          {
            $ref: '#/components/schemas/verbosity',
          },
        ],
        default: 'medium',
        'x-order': 5,
      },
      image_input: {
        type: 'array',
        items: {
          type: 'string',
          format: 'uri',
        },
        title: 'Image Input',
        default: [],
        'x-order': 3,
        description: 'List of images to send to the model',
      },
      json_schema: {
        type: 'object',
        title: 'Json Schema',
        default: {},
        'x-order': 11,
        description:
          'A JSON schema that the response must conform to. For simple data structures we recommend using `simple_text_format_schema` which will be converted to a JSON schema for you.',
      },
      instructions: {
        type: 'string',
        title: 'Instructions',
        'x-order': 2,
        nullable: true,
        description:
          "A system (or developer) message inserted into the model's context. When using along with previous_response_id, the instructions from a previous response will not be carried over to the next response. This makes it simple to swap out system (or developer) messages in new responses.",
      },
      simple_schema: {
        type: 'array',
        items: {
          type: 'string',
        },
        title: 'Simple Schema',
        default: [],
        'x-order': 7,
        description:
          "Create a JSON schema for the output to conform to. The schema will be created from a simple list of field specifications. Strings: 'thing' (defaults to string), 'thing:str', 'thing:string'. Booleans: 'is_a_thing:bool' or 'is_a_thing:boolean'. Numbers: 'count:number', 'count:int'. Lists: 'things:list' (defaults to list of strings), 'things:list:str', 'number_things:list:number', etc. Nested objects are not supported, use `json_schema` instead.",
      },
      input_item_list: {
        type: 'array',
        items: {
          type: 'object',
        },
        title: 'Input Item List',
        default: [],
        'x-order': 8,
        description:
          'A list of one or many input items to the model, containing different content types. This parameter corresponds with the `input` OpenAI API parameter. For more details see: https://platform.openai.com/docs/api-reference/responses/create#responses_create-input. Similar to the `messages` parameter, but with more flexibility in the content types.',
      },
      reasoning_effort: {
        enum: ['minimal', 'low', 'medium', 'high'],
        type: 'string',
        title: 'reasoning_effort',
        description:
          'Constrains effort on reasoning for GPT-5 models. Currently supported values are minimal, low, medium, and high. The minimal value gets answers back faster without extensive reasoning first. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning).',
        $ref: '#/components/schemas/reasoning_effort',
        allOf: [
          {
            $ref: '#/components/schemas/reasoning_effort',
          },
        ],
        default: 'minimal',
        'x-order': 4,
      },
      enable_web_search: {
        type: 'boolean',
        title: 'Enable Web Search',
        default: false,
        'x-order': 6,
        description: 'Allow GPT-5 to use web search for the response.',
      },
      max_output_tokens: {
        type: 'integer',
        title: 'Max Output Tokens',
        'x-order': 12,
        nullable: true,
        description:
          'Maximum number of completion tokens to generate. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning).',
      },
      previous_response_id: {
        type: 'string',
        title: 'Previous Response Id',
        'x-order': 9,
        nullable: true,
        description: 'The ID of a previous response to continue from.',
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 'gpt-5',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'gpt-5',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or 800,000 tokens for $1',
            metric: 'token_input_count',
            metric_display: 'input token',
            price: '$1.25',
            title: 'per million input tokens',
            type: 'per-unit',
          },
          {
            description: 'or 100,000 tokens for $1',
            metric: 'token_output_count',
            metric_display: 'output token',
            price: '$0.01',
            title: 'per thousand output tokens',
            type: 'per-unit',
          },
        ],
        title: null,
      },
      {
        criteria: [
          {
            description: 'gpt-5-nano',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'gpt-5-nano',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or 20,000,000 tokens for $1',
            metric: 'token_input_count',
            metric_display: 'input token',
            price: '$0.05',
            title: 'per million input tokens',
            type: 'per-unit',
          },
          {
            description: 'or 2,500,000 tokens for $1',
            metric: 'token_output_count',
            metric_display: 'output token',
            price: '$0.40',
            title: 'per million output tokens',
            type: 'per-unit',
          },
        ],
        title: null,
      },
      {
        criteria: [
          {
            description: 'gpt-5-mini',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'gpt-5-mini',
          },
        ],
        description: null,
        prices: [
          {
            description: 'or 4,000,000 tokens for $1',
            metric: 'token_input_count',
            metric_display: 'input token',
            price: '$0.25',
            title: 'per million input tokens',
            type: 'per-unit',
          },
          {
            description: 'or 500,000 tokens for $1',
            metric: 'token_output_count',
            metric_display: 'output token',
            price: '$2',
            title: 'per million output tokens',
            type: 'per-unit',
          },
        ],
        title: null,
      },
    ],
  },
  'prunaai/p-video-2': {
    sourceUrl: 'https://replicate.com/prunaai/p-video-2/api/schema',
    inputProperties: {
      fps: {
        enum: [24, 48],
        type: 'integer',
        title: 'fps',
        description: 'Frames per second of the video.',
        $ref: '#/components/schemas/fps',
        allOf: [
          {
            $ref: '#/components/schemas/fps',
          },
        ],
        default: 24,
        'x-order': 7,
      },
      seed: {
        type: 'integer',
        title: 'Seed',
        'x-order': 12,
        nullable: true,
        description: 'Random seed. Set for reproducible generation.',
      },
      audio: {
        type: 'string',
        title: 'Audio',
        format: 'uri',
        'x-order': 3,
        nullable: true,
        description:
          'Input audio to condition video generation. Supports flac, mp3, wav.',
      },
      draft: {
        type: 'boolean',
        title: 'Draft',
        default: false,
        'x-order': 8,
        description:
          'Draft mode. Generates a lower-quality preview of the video.',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
        'x-order': 1,
        nullable: true,
        description:
          'Input image to generate video from (image-to-video). Supports jpg, jpeg, png, webp.',
      },
      no_op: {
        type: 'boolean',
        title: 'No Op',
        default: false,
        'x-order': 13,
        description: 'Health check mode - returns status without inference.',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
        'x-order': 0,
        description: 'Text prompt for video generation.',
      },
      duration: {
        type: 'integer',
        title: 'Duration',
        maximum: 20,
        minimum: 1,
        'x-order': 4,
        nullable: true,
        description:
          'Duration of the video in seconds (1-20). Leave empty to let the model choose length from the prompt. Ignored when audio is provided.',
      },
      resolution: {
        enum: ['720p', '1080p'],
        type: 'string',
        title: 'resolution',
        description: 'Resolution of the video.',
        $ref: '#/components/schemas/resolution',
        allOf: [
          {
            $ref: '#/components/schemas/resolution',
          },
        ],
        default: '720p',
        'x-order': 6,
      },
      save_audio: {
        type: 'boolean',
        title: 'Save Audio',
        default: true,
        'x-order': 11,
        description: 'Save the video with audio.',
      },
      aspect_ratio: {
        enum: ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1'],
        type: 'string',
        title: 'aspect_ratio',
        description:
          'Aspect ratio of the video. Ignored when an input image is provided.',
        $ref: '#/components/schemas/aspect_ratio',
        allOf: [
          {
            $ref: '#/components/schemas/aspect_ratio',
          },
        ],
        default: '16:9',
        'x-order': 5,
      },
      last_frame_image: {
        type: 'string',
        title: 'Last Frame Image',
        format: 'uri',
        'x-order': 2,
        nullable: true,
        description:
          'Reference image for the last frame of the video. Supports jpg, jpeg, png, webp.',
      },
      prompt_upsampling: {
        type: 'boolean',
        title: 'Prompt Upsampling',
        default: true,
        'x-order': 9,
        description: 'Use prompt upsampling to enhance the prompt.',
      },
      disable_safety_filter: {
        type: 'boolean',
        title: 'Disable Safety Filter',
        default: true,
        'x-order': 10,
        description:
          'Disable safety filter for prompts (and input image). When disabled, prompts are not checked for unsafe content before generation.',
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 'base',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'base',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
        ],
        description: '720p full quality',
        prices: [
          {
            description: 'or around 33 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.03',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '720p',
      },
      {
        criteria: [
          {
            description: 'draft',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'draft',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
        ],
        description: '720p draft mode',
        prices: [
          {
            description: 'or around 66 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.015',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '720p draft',
      },
      {
        criteria: [
          {
            description: 'base',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'base',
          },
          {
            description: '1080p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '1080p',
          },
        ],
        description: '1080p full quality',
        prices: [
          {
            description: 'or around 16 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.06',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '1080p',
      },
      {
        criteria: [
          {
            description: 'draft',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'draft',
          },
          {
            description: '1080p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '1080p',
          },
        ],
        description: '1080p draft mode',
        prices: [
          {
            description: 'or around 33 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.03',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '1080p draft',
      },
    ],
  },
  'prunaai/p-video-2-pro': {
    sourceUrl: 'https://replicate.com/prunaai/p-video-2-pro/api/schema',
    inputProperties: {
      mode: {
        enum: ['quality', 'speed', 'cost'],
        type: 'string',
        title: 'mode',
        description: 'Generation mode: quality, speed, or cost.',
        $ref: '#/components/schemas/mode',
        allOf: [
          {
            $ref: '#/components/schemas/mode',
          },
        ],
        default: 'speed',
        'x-order': 1,
      },
      seed: {
        type: 'integer',
        title: 'Seed',
        'x-order': 8,
        nullable: true,
        description: 'Random seed for reproducible generation.',
      },
      image: {
        type: 'string',
        title: 'Image',
        format: 'uri',
        'x-order': 3,
        nullable: true,
        description: 'First-frame reference image.',
      },
      prompt: {
        type: 'string',
        title: 'Prompt',
        'x-order': 0,
        description: 'Text prompt for video generation.',
      },
      duration: {
        type: 'integer',
        title: 'Duration',
        default: 5,
        maximum: 15,
        minimum: 5,
        'x-order': 5,
        description: 'Video duration in seconds.',
      },
      resolution: {
        enum: ['480p', '768p', '1080p', '2k', '4k'],
        type: 'string',
        title: 'resolution',
        description:
          'Video resolution. 1080p, 2k and 4k generate at 768p and upscale it (24 fps kept).',
        $ref: '#/components/schemas/resolution',
        allOf: [
          {
            $ref: '#/components/schemas/resolution',
          },
        ],
        default: '768p',
        'x-order': 6,
      },
      aspect_ratio: {
        enum: ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1'],
        type: 'string',
        title: 'aspect_ratio',
        description:
          'Aspect ratio; reference images determine the canvas when provided.',
        $ref: '#/components/schemas/aspect_ratio',
        allOf: [
          {
            $ref: '#/components/schemas/aspect_ratio',
          },
        ],
        default: '16:9',
        'x-order': 7,
      },
      last_frame_image: {
        type: 'string',
        title: 'Last Frame Image',
        format: 'uri',
        'x-order': 4,
        nullable: true,
        description: 'Last-frame reference image.',
      },
      prompt_upsampler: {
        enum: ['off', 'turbo', 'max'],
        type: 'string',
        title: 'prompt_upsampler',
        description: 'Expand your prompt before video generation.',
        $ref: '#/components/schemas/prompt_upsampler',
        allOf: [
          {
            $ref: '#/components/schemas/prompt_upsampler',
          },
        ],
        default: 'turbo',
        'x-order': 2,
      },
      enable_safety_filter: {
        type: 'boolean',
        title: 'Enable Safety Filter',
        default: false,
        'x-order': 9,
        description:
          'Check the inputs against the content policy. When off, only the always-on categories (sexual content involving minors, self-harm intent or instructions) are still blocked.',
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 'cost',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'cost',
          },
          {
            description: '480p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '480p',
          },
        ],
        description: '480p resolution, cost mode',
        prices: [
          {
            description: 'or 100 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.01',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '480p cost',
      },
      {
        criteria: [
          {
            description: 'cost',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'cost',
          },
          {
            description: '768p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '768p',
          },
        ],
        description: '768p resolution, cost mode',
        prices: [
          {
            description: 'or 40 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.025',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '768p cost',
      },
      {
        criteria: [
          {
            description: 'speed',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'speed',
          },
          {
            description: '480p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '480p',
          },
        ],
        description: '480p resolution, speed mode',
        prices: [
          {
            description: 'or 50 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.02',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '480p speed',
      },
      {
        criteria: [
          {
            description: 'quality',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'quality',
          },
          {
            description: '480p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '480p',
          },
        ],
        description: '480p resolution, quality mode',
        prices: [
          {
            description: 'or 25 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.04',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '480p quality',
      },
      {
        criteria: [
          {
            description: 'speed',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'speed',
          },
          {
            description: '768p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '768p',
          },
        ],
        description: '768p resolution, speed mode',
        prices: [
          {
            description: 'or around 28 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.035',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '768p speed',
      },
      {
        criteria: [
          {
            description: 'quality',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'quality',
          },
          {
            description: '768p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '768p',
          },
        ],
        description: '768p resolution, quality mode',
        prices: [
          {
            description: 'or around 13 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.075',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: '768p quality',
      },
    ],
  },
  'bytedance/video-upscaler': {
    sourceUrl: 'https://replicate.com/bytedance/video-upscaler/api/schema',
    inputProperties: {
      scene: {
        enum: ['aigc', 'short_series', 'ugc', 'old_film', 'common'],
        type: 'string',
        title: 'scene',
        description:
          "Scene-based enhancement preset. 'aigc' is recommended for Seedance / other model outputs. 'short_series' is tuned for short-form drama, 'ugc' for user-generated content, 'old_film' for film restoration, 'common' for everything else.",
        default: 'aigc',
        'x-order': 2,
      },
      video: {
        type: 'string',
        title: 'Video',
        format: 'uri',
        'x-order': 0,
        description:
          'Video to upscale and enhance. Typically a Seedance 2.0 output (1080p/24fps), but any AIGC video works.',
      },
      target_fps: {
        enum: [24, 30, 60, 120],
        type: 'integer',
        title: 'target_fps',
        description:
          'Target output frame rate. Frame interpolation is applied if higher than the source. Valid range: 1\u2013120.',
        default: 60,
        'x-order': 4,
      },
      processing_type: {
        enum: ['standard', 'pro'],
        type: 'string',
        title: 'processing_type',
        description:
          "Processing tier. 'standard' is self-serve and works for any BytePlus VOD account. 'pro' uses a higher-quality enhancement model \u2014 better skin textures and fine detail for real-people footage \u2014 but requires your BytePlus account to be whitelisted first (file a support ticket).",
        default: 'standard',
        'x-order': 1,
      },
      target_resolution: {
        enum: ['240p', '360p', '480p', '540p', '720p', '1080p', '2k', '4k'],
        type: 'string',
        title: 'target_resolution',
        description:
          'Target output resolution. BytePlus VOD uses lowercase suffixes (`2k`/`4k` not `2K`/`4K`). 4k is the native maximum.',
        default: '4k',
        'x-order': 3,
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 'standard',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'standard',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
          {
            description: '\u2264 30',
            subtype: 'open-closed',
            title: 'target frames per second',
            type: 'range',
            value: [null, 30],
          },
        ],
        description: 'Standard tier, 720p output at 30fps or below',
        prices: [
          {
            description: 'or around 290 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$3.443',
            title: 'per thousand seconds of output video',
            type: 'per-unit',
          },
        ],
        title: 'Standard 720p \u226430fps',
      },
      {
        criteria: [
          {
            description: 'standard',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'standard',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
          {
            description: '> 30',
            subtype: 'open',
            title: 'target frames per second',
            type: 'range',
            value: [30, null],
          },
        ],
        description: 'Standard tier, 720p output above 30fps',
        prices: [
          {
            description: 'or around 145 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$6.887',
            title: 'per thousand seconds of output video',
            type: 'per-unit',
          },
        ],
        title: 'Standard 720p >30fps',
      },
      {
        criteria: [
          {
            description: 'standard',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'standard',
          },
          {
            description: '1080p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '1080p',
          },
          {
            description: '\u2264 30',
            subtype: 'open-closed',
            title: 'target frames per second',
            type: 'range',
            value: [null, 30],
          },
        ],
        description: 'Standard tier, 1080p output at 30fps or below',
        prices: [
          {
            description: 'or around 145 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$6.887',
            title: 'per thousand seconds of output video',
            type: 'per-unit',
          },
        ],
        title: 'Standard 1080p \u226430fps',
      },
      {
        criteria: [
          {
            description: 'standard',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'standard',
          },
          {
            description: '1080p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '1080p',
          },
          {
            description: '> 30',
            subtype: 'open',
            title: 'target frames per second',
            type: 'range',
            value: [30, null],
          },
        ],
        description: 'Standard tier, 1080p output above 30fps',
        prices: [
          {
            description: 'or around 72 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.013773',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Standard 1080p >30fps',
      },
      {
        criteria: [
          {
            description: 'standard',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'standard',
          },
          {
            description: '2k',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '2k',
          },
          {
            description: '\u2264 30',
            subtype: 'open-closed',
            title: 'target frames per second',
            type: 'range',
            value: [null, 30],
          },
        ],
        description: 'Standard tier, 2K output at 30fps or below',
        prices: [
          {
            description: 'or around 72 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.013773',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Standard 2K \u226430fps',
      },
      {
        criteria: [
          {
            description: 'standard',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'standard',
          },
          {
            description: '2k',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '2k',
          },
          {
            description: '> 30',
            subtype: 'open',
            title: 'target frames per second',
            type: 'range',
            value: [30, null],
          },
        ],
        description: 'Standard tier, 2K output above 30fps',
        prices: [
          {
            description: 'or around 36 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.027548',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Standard 2K >30fps',
      },
      {
        criteria: [
          {
            description: 'standard',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'standard',
          },
          {
            description: '4k',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '4k',
          },
          {
            description: '\u2264 30',
            subtype: 'open-closed',
            title: 'target frames per second',
            type: 'range',
            value: [null, 30],
          },
        ],
        description: 'Standard tier, 4K output at 30fps or below',
        prices: [
          {
            description: 'or around 36 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.027548',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Standard 4K \u226430fps',
      },
      {
        criteria: [
          {
            description: 'standard',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'standard',
          },
          {
            description: '4k',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '4k',
          },
          {
            description: '> 30',
            subtype: 'open',
            title: 'target frames per second',
            type: 'range',
            value: [30, null],
          },
        ],
        description: 'Standard tier, 4K output above 30fps',
        prices: [
          {
            description: 'or around 18 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.055097',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Standard 4K >30fps',
      },
      {
        criteria: [
          {
            description: 'pro',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'pro',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
          {
            description: '\u2264 30',
            subtype: 'open-closed',
            title: 'target frames per second',
            type: 'range',
            value: [null, 30],
          },
        ],
        description: 'Pro tier, 720p output at 30fps or below',
        prices: [
          {
            description: 'or around 29 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.034435',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Pro 720p \u226430fps',
      },
      {
        criteria: [
          {
            description: 'pro',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'pro',
          },
          {
            description: '720p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '720p',
          },
          {
            description: '> 30',
            subtype: 'open',
            title: 'target frames per second',
            type: 'range',
            value: [30, null],
          },
        ],
        description: 'Pro tier, 720p output above 30fps',
        prices: [
          {
            description: 'or around 14 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.06887',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Pro 720p >30fps',
      },
      {
        criteria: [
          {
            description: 'pro',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'pro',
          },
          {
            description: '1080p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '1080p',
          },
          {
            description: '\u2264 30',
            subtype: 'open-closed',
            title: 'target frames per second',
            type: 'range',
            value: [null, 30],
          },
        ],
        description: 'Pro tier, 1080p output at 30fps or below',
        prices: [
          {
            description: 'or around 14 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.06887',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Pro 1080p \u226430fps',
      },
      {
        criteria: [
          {
            description: 'pro',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'pro',
          },
          {
            description: '1080p',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '1080p',
          },
          {
            description: '> 30',
            subtype: 'open',
            title: 'target frames per second',
            type: 'range',
            value: [30, null],
          },
        ],
        description: 'Pro tier, 1080p output above 30fps',
        prices: [
          {
            description: 'or around 72 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.137742',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Pro 1080p >30fps',
      },
      {
        criteria: [
          {
            description: 'pro',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'pro',
          },
          {
            description: '2k',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '2k',
          },
          {
            description: '\u2264 30',
            subtype: 'open-closed',
            title: 'target frames per second',
            type: 'range',
            value: [null, 30],
          },
        ],
        description: 'Pro tier, 2K output at 30fps or below',
        prices: [
          {
            description: 'or around 72 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.137742',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Pro 2K \u226430fps',
      },
      {
        criteria: [
          {
            description: 'pro',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'pro',
          },
          {
            description: '2k',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '2k',
          },
          {
            description: '> 30',
            subtype: 'open',
            title: 'target frames per second',
            type: 'range',
            value: [30, null],
          },
        ],
        description: 'Pro tier, 2K output above 30fps',
        prices: [
          {
            description: 'or around 36 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.275482',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Pro 2K >30fps',
      },
      {
        criteria: [
          {
            description: 'pro',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'pro',
          },
          {
            description: '4k',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '4k',
          },
          {
            description: '\u2264 30',
            subtype: 'open-closed',
            title: 'target frames per second',
            type: 'range',
            value: [null, 30],
          },
        ],
        description: 'Pro tier, 4K output at 30fps or below',
        prices: [
          {
            description: 'or around 36 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.275482',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Pro 4K \u226430fps',
      },
      {
        criteria: [
          {
            description: 'pro',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'pro',
          },
          {
            description: '4k',
            subtype: 'string',
            title: 'target resolution',
            type: 'equals',
            value: '4k',
          },
          {
            description: '> 30',
            subtype: 'open',
            title: 'target frames per second',
            type: 'range',
            value: [30, null],
          },
        ],
        description: 'Pro tier, 4K output above 30fps',
        prices: [
          {
            description: 'or around 18 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.550965',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Pro 4K >30fps',
      },
    ],
  },
  // Replicate billingConfig captured 2026-11-01: a priceless own-key tier now
  // sits beside the priced tier.
  'openai/sora-2': {
    sourceUrl: 'https://replicate.com/openai/sora-2',
    inputProperties: {
      prompt: { type: 'string', title: 'Prompt' },
      seconds: {
        enum: [4, 8, 12],
        type: 'integer',
        title: 'seconds',
        default: 4,
      },
      aspect_ratio: {
        enum: ['portrait', 'landscape'],
        type: 'string',
        title: 'aspect_ratio',
        default: 'portrait',
      },
      openai_api_key: {
        type: 'string',
        title: 'Openai Api Key',
        format: 'password',
        nullable: true,
        writeOnly: true,
      },
      input_reference: {
        type: 'string',
        title: 'Input Reference',
        format: 'uri',
        nullable: true,
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 'sora-2-own-key',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'sora-2-own-key',
          },
        ],
        description: 'You pay OpenAI directly via your API key.',
        prices: [],
        title: 'OpenAI (own key)',
      },
      {
        criteria: [
          {
            description: 'sora-2',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'sora-2',
          },
        ],
        description: 'Charged per second of generated video.',
        prices: [
          {
            description: 'or 10 seconds for $1',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.10',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Standard quality',
      },
    ],
  },
  'openai/sora-2-pro': {
    sourceUrl: 'https://replicate.com/openai/sora-2-pro',
    inputProperties: {
      prompt: { type: 'string', title: 'Prompt' },
      seconds: {
        enum: [4, 8, 12],
        type: 'integer',
        title: 'seconds',
        default: 4,
      },
      aspect_ratio: {
        enum: ['portrait', 'landscape'],
        type: 'string',
        title: 'aspect_ratio',
        default: 'portrait',
      },
      openai_api_key: {
        type: 'string',
        title: 'Openai Api Key',
        format: 'password',
        nullable: true,
        writeOnly: true,
      },
      input_reference: {
        type: 'string',
        title: 'Input Reference',
        format: 'uri',
        nullable: true,
      },
      resolution: {
        enum: ['standard', 'high'],
        type: 'string',
        title: 'resolution',
        default: 'standard',
      },
    },
    tiers: [
      {
        criteria: [
          {
            description: 'sora-2-pro-own-key',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'sora-2-pro-own-key',
          },
        ],
        description: 'You pay OpenAI directly via your API key.',
        prices: [],
        title: 'OpenAI (own key)',
      },
      {
        criteria: [
          {
            description: 'sora-2-pro-standard',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'sora-2-pro-standard',
          },
        ],
        description:
          '1280x720 landscape or 720x1280 portrait. Charged per second of generated video.',
        prices: [
          {
            description: 'or around 33 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.30',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'Standard quality (720p)',
      },
      {
        criteria: [
          {
            description: 'sora-2-pro-high',
            subtype: 'string',
            title: 'model variant',
            type: 'equals',
            value: 'sora-2-pro-high',
          },
        ],
        description:
          '1792x1024 landscape or 1024x1792 portrait. Charged per second of generated video.',
        prices: [
          {
            description: 'or 20 seconds for $10',
            metric: 'video_output_duration_seconds',
            metric_display: 'second of output video',
            price: '$0.50',
            title: 'per second of output video',
            type: 'per-unit',
          },
        ],
        title: 'High quality (1024p)',
      },
    ],
  },
};
