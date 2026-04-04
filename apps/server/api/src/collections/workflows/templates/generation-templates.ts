import { AVATAR_UGC_WORKFLOW_TEMPLATE } from '@api/collections/workflows/templates/avatar-ugc-workflow.template';
import { AVATAR_UGC_X_LANDSCAPE_WORKFLOW_TEMPLATE } from '@api/collections/workflows/templates/avatar-ugc-x-landscape-workflow.template';
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

const VIRTUAL_STAGING_RESCUE_TEMPLATE: WorkflowTemplate = {
  category: 'real-estate',
  description:
    'Turn a rough apartment photo into realistic, listing-ready staged variants while preserving the actual room layout',
  edges: [
    {
      id: 'edge-source-photo-cleanup',
      source: 'workflow-input-source-photo',
      sourceHandle: 'value',
      target: 'ai-generate-image-cleanup',
      targetHandle: 'image',
    },
    {
      id: 'edge-source-photo-premium',
      source: 'workflow-input-source-photo',
      sourceHandle: 'value',
      target: 'ai-generate-image-premium',
      targetHandle: 'image',
    },
    {
      id: 'edge-room-type-virtual-staging-prompt',
      source: 'workflow-input-room-type',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-virtual-staging',
      targetHandle: 'roomType',
    },
    {
      id: 'edge-style-preset-virtual-staging-prompt',
      source: 'workflow-input-style-preset',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-virtual-staging',
      targetHandle: 'stylePreset',
    },
    {
      id: 'edge-listing-tier-virtual-staging-prompt',
      source: 'workflow-input-listing-tier',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-virtual-staging',
      targetHandle: 'listingTier',
    },
    {
      id: 'edge-virtual-staging-prompt-cleanup',
      source: 'ai-prompt-constructor-virtual-staging',
      sourceHandle: 'prompt',
      target: 'ai-generate-image-cleanup',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-virtual-staging-prompt-premium',
      source: 'ai-prompt-constructor-virtual-staging',
      sourceHandle: 'prompt',
      target: 'ai-generate-image-premium',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-virtual-staging-cleanup-output',
      source: 'ai-generate-image-cleanup',
      sourceHandle: 'image',
      target: 'workflow-output-listing-ready',
      targetHandle: 'value',
    },
    {
      id: 'edge-virtual-staging-premium-output',
      source: 'ai-generate-image-premium',
      sourceHandle: 'image',
      target: 'workflow-output-premium-staged',
      targetHandle: 'value',
    },
  ],
  icon: 'home',
  id: 'virtual-staging-rescue',
  inputVariables: [
    {
      key: 'sourcePhoto',
      label: 'Source Photo',
      required: true,
      type: 'image',
    },
    {
      key: 'roomType',
      label: 'Room Type',
      required: true,
      type: 'select',
      validation: {
        options: ['living room', 'bedroom', 'kitchen', 'bathroom', 'studio'],
      },
    },
    {
      key: 'stylePreset',
      label: 'Style Preset',
      required: true,
      type: 'select',
      validation: {
        options: [
          'modern warm',
          'scandinavian',
          'minimal contemporary',
          'soft luxury',
        ],
      },
    },
    {
      key: 'listingTier',
      label: 'Listing Tier',
      required: true,
      type: 'select',
      validation: {
        options: ['standard', 'premium', 'luxury'],
      },
    },
  ],
  name: 'Virtual Staging Rescue',
  nodes: [
    {
      data: {
        config: {
          inputName: 'sourcePhoto',
          inputType: 'image',
          required: true,
        },
        label: 'Source Photo',
      },
      id: 'workflow-input-source-photo',
      position: { x: 0, y: 40 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'roomType',
          inputType: 'text',
          required: true,
        },
        label: 'Room Type',
      },
      id: 'workflow-input-room-type',
      position: { x: 0, y: 180 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'stylePreset',
          inputType: 'text',
          required: true,
        },
        label: 'Style Preset',
      },
      id: 'workflow-input-style-preset',
      position: { x: 0, y: 320 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'listingTier',
          inputType: 'text',
          required: true,
        },
        label: 'Listing Tier',
      },
      id: 'workflow-input-listing-tier',
      position: { x: 0, y: 460 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          template:
            'Create a photorealistic {{roomType}} listing image in a {{stylePreset}} style for a {{listingTier}} real estate listing. Preserve the exact room layout, walls, windows, doors, built-in fixtures, proportions, and camera viewpoint. Improve only lighting, clutter, furniture, material finish, cleanliness, and overall polish. Keep the result realistic, sale-ready, and believable.',
          variables: {},
        },
        label: 'Staging Prompt',
      },
      id: 'ai-prompt-constructor-virtual-staging',
      position: { x: 320, y: 250 },
      type: 'promptConstructor',
    },
    {
      data: {
        config: {
          model: 'qwen/qwen-image',
          negativePrompt:
            'cartoon, fantasy architecture, warped lines, altered windows, altered doors, changed floor plan, extreme fisheye, oversaturated, unrealistic materials',
          strength: 0.32,
          style: 'sale-ready cleanup with subtle realistic furnishing',
        },
        label: 'Listing-Ready Variant',
      },
      id: 'ai-generate-image-cleanup',
      position: { x: 680, y: 140 },
      type: 'imageGen',
    },
    {
      data: {
        config: {
          model: 'qwen/qwen-image',
          negativePrompt:
            'cartoon, fantasy architecture, warped lines, altered windows, altered doors, changed floor plan, overdesigned luxury set, surreal decor, unrealistic materials',
          strength: 0.42,
          style: 'premium staged editorial polish while staying realistic',
        },
        label: 'Premium Staged Variant',
      },
      id: 'ai-generate-image-premium',
      position: { x: 680, y: 360 },
      type: 'imageGen',
    },
    {
      data: {
        config: {
          outputName: 'listingReady',
        },
        label: 'Listing-Ready Output',
      },
      id: 'workflow-output-listing-ready',
      position: { x: 1020, y: 140 },
      type: 'workflowOutput',
    },
    {
      data: {
        config: {
          outputName: 'premiumStaged',
        },
        label: 'Premium Staged Output',
      },
      id: 'workflow-output-premium-staged',
      position: { x: 1020, y: 360 },
      type: 'workflowOutput',
    },
  ],
  steps: [],
};

const FLOOR_PLAN_INTERIOR_PREVIEW_TEMPLATE: WorkflowTemplate = {
  category: 'real-estate',
  description:
    'Create a layout-faithful AI preview from a floor plan to help real estate teams visualize the finished interior, not to provide an architectural guarantee',
  edges: [
    {
      id: 'edge-floor-plan-hero',
      source: 'workflow-input-floor-plan-image',
      sourceHandle: 'value',
      target: 'ai-generate-image-hero-wide',
      targetHandle: 'image',
    },
    {
      id: 'edge-floor-plan-alt',
      source: 'workflow-input-floor-plan-image',
      sourceHandle: 'value',
      target: 'ai-generate-image-alt-angle',
      targetHandle: 'image',
    },
    {
      id: 'edge-floor-plan-detail',
      source: 'workflow-input-floor-plan-image',
      sourceHandle: 'value',
      target: 'ai-generate-image-detail-angle',
      targetHandle: 'image',
    },
    {
      id: 'edge-property-type-floor-plan-prompt',
      source: 'workflow-input-property-type',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-floor-plan',
      targetHandle: 'propertyType',
    },
    {
      id: 'edge-target-space-floor-plan-prompt',
      source: 'workflow-input-target-space',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-floor-plan',
      targetHandle: 'targetSpace',
    },
    {
      id: 'edge-style-preset-floor-plan-prompt',
      source: 'workflow-input-floor-plan-style-preset',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-floor-plan',
      targetHandle: 'stylePreset',
    },
    {
      id: 'edge-floor-plan-prompt-hero',
      source: 'ai-prompt-constructor-floor-plan',
      sourceHandle: 'prompt',
      target: 'ai-generate-image-hero-wide',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-floor-plan-prompt-alt',
      source: 'ai-prompt-constructor-floor-plan',
      sourceHandle: 'prompt',
      target: 'ai-generate-image-alt-angle',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-floor-plan-prompt-detail',
      source: 'ai-prompt-constructor-floor-plan',
      sourceHandle: 'prompt',
      target: 'ai-generate-image-detail-angle',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-floor-plan-hero-output',
      source: 'ai-generate-image-hero-wide',
      sourceHandle: 'image',
      target: 'workflow-output-hero-wide',
      targetHandle: 'value',
    },
    {
      id: 'edge-floor-plan-alt-output',
      source: 'ai-generate-image-alt-angle',
      sourceHandle: 'image',
      target: 'workflow-output-alt-angle',
      targetHandle: 'value',
    },
    {
      id: 'edge-floor-plan-detail-output',
      source: 'ai-generate-image-detail-angle',
      sourceHandle: 'image',
      target: 'workflow-output-detail-angle',
      targetHandle: 'value',
    },
  ],
  icon: 'blueprint',
  id: 'floor-plan-interior-preview',
  inputVariables: [
    {
      key: 'floorPlanImage',
      label: 'Floor Plan Image',
      required: true,
      type: 'image',
    },
    {
      key: 'propertyType',
      label: 'Property Type',
      required: true,
      type: 'select',
      validation: {
        options: ['apartment', 'studio', 'townhouse', 'villa', 'office'],
      },
    },
    {
      key: 'targetSpace',
      label: 'Target Space',
      required: true,
      type: 'select',
      validation: {
        options: ['living area', 'primary bedroom', 'kitchen', 'bathroom'],
      },
    },
    {
      key: 'stylePreset',
      label: 'Style Preset',
      required: true,
      type: 'select',
      validation: {
        options: [
          'modern natural',
          'warm contemporary',
          'minimal luxury',
          'scandinavian calm',
        ],
      },
    },
  ],
  name: 'Floor Plan Interior Preview',
  nodes: [
    {
      data: {
        config: {
          inputName: 'floorPlanImage',
          inputType: 'image',
          required: true,
        },
        label: 'Floor Plan Image',
      },
      id: 'workflow-input-floor-plan-image',
      position: { x: 0, y: 40 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'propertyType',
          inputType: 'text',
          required: true,
        },
        label: 'Property Type',
      },
      id: 'workflow-input-property-type',
      position: { x: 0, y: 180 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'targetSpace',
          inputType: 'text',
          required: true,
        },
        label: 'Target Space',
      },
      id: 'workflow-input-target-space',
      position: { x: 0, y: 320 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'stylePreset',
          inputType: 'text',
          required: true,
        },
        label: 'Style Preset',
      },
      id: 'workflow-input-floor-plan-style-preset',
      position: { x: 0, y: 460 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          template:
            'Create a layout-faithful interior visualization for a {{propertyType}} {{targetSpace}} in a {{stylePreset}} style using the uploaded floor plan as the structural guide. Preserve room adjacency, circulation, opening placement, and overall proportions as closely as possible. Show a believable real-estate marketing visualization, not an architectural guarantee.',
          variables: {},
        },
        label: 'Floor Plan Prompt',
      },
      id: 'ai-prompt-constructor-floor-plan',
      position: { x: 320, y: 250 },
      type: 'promptConstructor',
    },
    {
      data: {
        config: {
          model: 'black-forest-labs/flux-2-pro',
          negativePrompt:
            'impossible geometry, extra rooms, moved windows, moved doors, fantasy architecture, surreal structure, isometric blueprint overlay, warped perspective',
          style: 'hero wide shot, bright and marketable interior reveal',
        },
        label: 'Hero Wide Preview',
      },
      id: 'ai-generate-image-hero-wide',
      position: { x: 700, y: 80 },
      type: 'imageGen',
    },
    {
      data: {
        config: {
          model: 'black-forest-labs/flux-2-pro',
          negativePrompt:
            'impossible geometry, extra rooms, moved windows, moved doors, fantasy architecture, surreal structure, warped perspective',
          style: 'alternate angle that still respects the inferred plan layout',
        },
        label: 'Alternate Angle Preview',
      },
      id: 'ai-generate-image-alt-angle',
      position: { x: 700, y: 280 },
      type: 'imageGen',
    },
    {
      data: {
        config: {
          model: 'black-forest-labs/flux-2-pro',
          negativePrompt:
            'impossible geometry, extra rooms, moved windows, moved doors, fantasy architecture, surreal structure, warped perspective',
          style:
            'finish and detail angle focused on materials and real-estate polish',
        },
        label: 'Finish Detail Preview',
      },
      id: 'ai-generate-image-detail-angle',
      position: { x: 700, y: 480 },
      type: 'imageGen',
    },
    {
      data: {
        config: {
          outputName: 'heroWide',
        },
        label: 'Hero Wide Output',
      },
      id: 'workflow-output-hero-wide',
      position: { x: 1040, y: 80 },
      type: 'workflowOutput',
    },
    {
      data: {
        config: {
          outputName: 'alternateAngle',
        },
        label: 'Alternate Angle Output',
      },
      id: 'workflow-output-alt-angle',
      position: { x: 1040, y: 280 },
      type: 'workflowOutput',
    },
    {
      data: {
        config: {
          outputName: 'detailAngle',
        },
        label: 'Detail Angle Output',
      },
      id: 'workflow-output-detail-angle',
      position: { x: 1040, y: 480 },
      type: 'workflowOutput',
    },
  ],
  steps: [],
};

export const GENERATION_WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  'avatar-ugc-heygen':
    AVATAR_UGC_WORKFLOW_TEMPLATE as unknown as WorkflowTemplate,
  'avatar-ugc-x-landscape-heygen':
    AVATAR_UGC_X_LANDSCAPE_WORKFLOW_TEMPLATE as unknown as WorkflowTemplate,
  'complete-content-suite': {
    category: 'generation',
    description: 'Generate image, video, music, and article together',
    icon: 'suite',
    id: 'complete-content-suite',
    name: 'Complete Content Suite',
    steps: [
      {
        category: WorkflowStepCategory.GENERATE_IMAGE,
        config: {
          height: 1080,
          model: 'imagen4',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          prompt: '${imagePrompt}',
          quality: 'high',
          width: 1920,
        },
        id: 'generate-image-1',
        name: 'Generate Cover Image',
      },
      {
        category: WorkflowStepCategory.GENERATE_VIDEO,
        config: {
          duration: 10,
          model: 'klingai',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          prompt: '${videoPrompt}',
          resolution: '1080p',
        },
        dependsOn: ['generate-image-1'],
        id: 'generate-video-1',
        name: 'Generate Promo Video',
      },
      {
        category: WorkflowStepCategory.GENERATE_MUSIC,
        config: {
          duration: 60,
          genre: 'cinematic',
          model: 'musicgen',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          prompt: '${musicPrompt}',
        },
        id: 'generate-music-1',
        name: 'Generate Background Music',
      },
      {
        category: WorkflowStepCategory.GENERATE_ARTICLE,
        config: {
          includeImages: true,
          length: 'long',
          model: 'gpt-4-turbo-preview',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          topic: '${articleTopic}',
        },
        id: 'generate-article-1',
        name: 'Generate Article',
      },
    ],
  },
  'daily-image-generation': {
    category: 'generation',
    description: 'Generate AI images on a daily schedule',
    icon: 'image',
    id: 'daily-image-generation',
    name: 'Daily Image Generation',
    steps: [
      {
        category: WorkflowStepCategory.GENERATE_IMAGE,
        config: {
          height: 1024,
          model: 'imagen4', // Default model, user can override
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          prompt: '${prompt}', // Template variable
          quality: 'high',
          style: 'photorealistic',
          width: 1024,
        },
        id: 'generate-image',
        name: 'Generate AI Image',
      },
    ],
  },
  'floor-plan-interior-preview': FLOOR_PLAN_INTERIOR_PREVIEW_TEMPLATE,
  'motivational-quote-image': {
    category: 'generation',
    description: 'Generate a motivational quote image every day',
    icon: 'quote',
    id: 'motivational-quote-image',
    name: 'Daily Motivational Quote Image',
    steps: [
      {
        category: WorkflowStepCategory.GENERATE_ARTICLE,
        config: {
          length: 'short',
          model: 'gpt-4-turbo-preview',
          tone: 'inspirational',
          topic: 'motivational quote',
        },
        id: 'generate-quote-article',
        name: 'Generate Quote',
      },
      {
        category: WorkflowStepCategory.GENERATE_IMAGE,
        config: {
          height: 1080,
          model: 'leonardo',
          prompt:
            // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
            'Beautiful inspirational background with text overlay: ${quote}',
          style: 'artistic',
          width: 1080,
        },
        dependsOn: ['generate-quote-article'],
        id: 'generate-quote-image',
        name: 'Generate Quote Image',
      },
    ],
  },
  'music-library-builder': {
    category: 'generation',
    description: 'Build a music library with scheduled generation',
    icon: 'music',
    id: 'music-library-builder',
    name: 'Music Library Builder',
    steps: [
      {
        category: WorkflowStepCategory.GENERATE_MUSIC,
        config: {
          duration: 60, // seconds
          genre: 'ambient',
          instruments: [],
          model: 'musicgen', // Default model
          mood: 'calm',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          prompt: '${prompt}',
          tempo: 'medium',
        },
        id: 'generate-music',
        name: 'Generate AI Music',
      },
    ],
  },
  'scheduled-video-creation': {
    category: 'generation',
    description: 'Generate AI videos on a schedule',
    icon: 'video',
    id: 'scheduled-video-creation',
    name: 'Scheduled Video Creation',
    steps: [
      {
        category: WorkflowStepCategory.GENERATE_VIDEO,
        config: {
          duration: 5, // seconds
          fps: 30,
          model: 'klingai', // Default model
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          prompt: '${prompt}',
          resolution: '1080p',
          style: 'cinematic',
        },
        id: 'generate-video',
        name: 'Generate AI Video',
      },
    ],
  },
  'social-media-video-series': {
    category: 'generation',
    description: 'Generate short-form video content for social media',
    icon: 'social',
    id: 'social-media-video-series',
    name: 'Social Media Video Series',
    steps: [
      {
        category: WorkflowStepCategory.GENERATE_VIDEO,
        config: {
          aspectRatio: '9:16', // Portrait for stories/reels
          duration: 15, // Perfect for social media
          model: 'klingai',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          prompt: '${prompt}',
          resolution: '1080p',
        },
        id: 'generate-video-content',
        name: 'Generate Short Video',
      },
      {
        category: WorkflowStepCategory.CAPTION,
        config: {
          fontSize: 'large',
          position: 'center',
          style: 'dynamic',
        },
        dependsOn: ['generate-video-content'],
        id: 'add-captions',
        name: 'Add Captions',
      },
    ],
  },
  'tiktok-slideshow-automation': {
    category: 'social',
    description:
      'Automated TikTok slideshow creation: hook generation → 6 AI images → text overlay → caption → publish',
    icon: 'tiktok',
    id: 'tiktok-slideshow-automation',
    name: 'TikTok Slideshow Automation',
    steps: [
      {
        category: WorkflowStepCategory.GENERATE_HOOK,
        config: {
          hookFormula: 'person_conflict_resolution',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          niche: '${niche}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          product: '${product}',
          toneStyle: 'storytelling',
        },
        id: 'generate-hook',
        name: 'Generate Viral Hook',
      },
      {
        category: WorkflowStepCategory.IMAGE_BATCH,
        config: {
          aspectRatio: 'tiktok_portrait',
          model: 'gpt-image-1',
          slideCount: 6,
        },
        dependsOn: ['generate-hook'],
        id: 'generate-slides',
        name: 'Generate Slideshow Images',
      },
      {
        category: WorkflowStepCategory.TEXT_OVERLAY,
        config: {
          fontSize: 72,
          fontWeight: 'black',
          position: 'center',
          slideIndex: 0,
          strokeColor: '#000000',
          strokeWidth: 3,
          textColor: '#FFFFFF',
        },
        dependsOn: ['generate-hook', 'generate-slides'],
        id: 'overlay-hook-text',
        name: 'Add Hook Text to Slide 1',
      },
      {
        category: WorkflowStepCategory.CAPTION,
        config: {
          hashtagCount: 5,
          includeCTA: true,
          includeEmojis: true,
          includeHashtags: true,
          platform: 'tiktok',
          tone: 'storytelling',
        },
        dependsOn: ['generate-hook'],
        id: 'generate-caption',
        name: 'Write TikTok Caption',
      },
      {
        category: WorkflowStepCategory.PUBLISH,
        config: {
          platforms: ['tiktok'],
          schedule: 'immediate',
        },
        dependsOn: ['overlay-hook-text', 'generate-caption'],
        id: 'publish-tiktok',
        name: 'Publish to TikTok',
      },
      {
        category: WorkflowStepCategory.PERFORMANCE_TRACK,
        config: {
          autoAnalyzeAfterHours: 24,
          trackingEnabled: true,
        },
        dependsOn: ['publish-tiktok'],
        id: 'track-performance',
        name: 'Track Hook Performance',
      },
    ],
  },
  'virtual-staging-rescue': VIRTUAL_STAGING_RESCUE_TEMPLATE,
  'weekly-article-batch': {
    category: 'generation',
    description: 'Generate multiple articles weekly',
    icon: 'article',
    id: 'weekly-article-batch',
    name: 'Weekly Article Generation',
    steps: [
      {
        category: WorkflowStepCategory.GENERATE_ARTICLE,
        config: {
          includeImages: true,
          keywords: [],
          length: 'medium', // short, medium, long
          model: 'gpt-4-turbo-preview',
          seoOptimized: true,
          tone: 'professional',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
          topic: '${topic}',
        },
        id: 'generate-article',
        name: 'Generate AI Article',
      },
    ],
  },
};
