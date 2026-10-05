/** Public provider schema/billingConfig captured 2026-10-05. No approvals or margins. */
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
};
