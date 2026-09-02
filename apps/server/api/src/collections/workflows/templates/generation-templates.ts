import { AVATAR_UGC_WORKFLOW_TEMPLATE } from '@api/collections/workflows/templates/avatar-ugc-workflow.template';
import { AVATAR_UGC_X_LANDSCAPE_WORKFLOW_TEMPLATE } from '@api/collections/workflows/templates/avatar-ugc-x-landscape-workflow.template';
import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';

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
    createTemplateActionNode('promptConstructor', {
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
    }),
    createTemplateActionNode('imageGen', {
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
    }),
    createTemplateActionNode('imageGen', {
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
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'listingReady',
        },
        label: 'Listing-Ready Output',
      },
      id: 'workflow-output-listing-ready',
      position: { x: 1020, y: 140 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'premiumStaged',
        },
        label: 'Premium Staged Output',
      },
      id: 'workflow-output-premium-staged',
      position: { x: 1020, y: 360 },
    }),
  ],
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
    createTemplateActionNode('promptConstructor', {
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
    }),
    createTemplateActionNode('imageGen', {
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
    }),
    createTemplateActionNode('imageGen', {
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
    }),
    createTemplateActionNode('imageGen', {
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
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'heroWide',
        },
        label: 'Hero Wide Output',
      },
      id: 'workflow-output-hero-wide',
      position: { x: 1040, y: 80 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'alternateAngle',
        },
        label: 'Alternate Angle Output',
      },
      id: 'workflow-output-alt-angle',
      position: { x: 1040, y: 280 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'detailAngle',
        },
        label: 'Detail Angle Output',
      },
      id: 'workflow-output-detail-angle',
      position: { x: 1040, y: 480 },
    }),
  ],
};

const FOUNDER_X_POST_TEMPLATE: WorkflowTemplate = {
  category: 'generation',
  description:
    'Generate founder-led X posts with sharp hooks, concrete proof, and a clear editorial angle before review',
  edges: [
    {
      id: 'edge-founder-x-post-topic',
      source: 'workflow-input-founder-post-topic',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-x-post',
      targetHandle: 'topic',
    },
    {
      id: 'edge-founder-x-post-angle',
      source: 'workflow-input-founder-post-angle',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-x-post',
      targetHandle: 'angle',
    },
    {
      id: 'edge-founder-x-post-proof',
      source: 'workflow-input-founder-post-proof',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-x-post',
      targetHandle: 'proofPoint',
    },
    {
      id: 'edge-founder-x-post-cta',
      source: 'workflow-input-founder-post-cta',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-x-post',
      targetHandle: 'cta',
    },
    {
      id: 'edge-founder-x-post-prompt-llm',
      source: 'ai-prompt-constructor-founder-x-post',
      sourceHandle: 'prompt',
      target: 'ai-generate-founder-x-post',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-founder-x-post-output',
      source: 'ai-generate-founder-x-post',
      sourceHandle: 'text',
      target: 'workflow-output-founder-x-post',
      targetHandle: 'value',
    },
  ],
  icon: 'twitter',
  id: 'founder-x-post',
  inputVariables: [
    {
      key: 'topic',
      label: 'Topic',
      required: true,
      type: 'text',
    },
    {
      key: 'angle',
      label: 'Editorial Angle',
      required: true,
      type: 'text',
    },
    {
      key: 'proofPoint',
      label: 'Proof Point',
      required: false,
      type: 'text',
    },
    {
      key: 'cta',
      label: 'CTA',
      required: false,
      type: 'text',
    },
  ],
  name: 'Founder X Post',
  nodes: [
    {
      data: {
        config: {
          inputName: 'topic',
          inputType: 'text',
          required: true,
        },
        label: 'Topic',
      },
      id: 'workflow-input-founder-post-topic',
      position: { x: 0, y: 40 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'angle',
          inputType: 'text',
          required: true,
        },
        label: 'Editorial Angle',
      },
      id: 'workflow-input-founder-post-angle',
      position: { x: 0, y: 180 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'proofPoint',
          inputType: 'text',
          required: false,
        },
        label: 'Proof Point',
      },
      id: 'workflow-input-founder-post-proof',
      position: { x: 0, y: 320 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'cta',
          inputType: 'text',
          required: false,
        },
        label: 'CTA',
      },
      id: 'workflow-input-founder-post-cta',
      position: { x: 0, y: 460 },
      type: 'workflowInput',
    },
    createTemplateActionNode('promptConstructor', {
      data: {
        config: {
          template:
            'You are writing a founder-led X post for Genfeed. Topic: {{topic}}. Angle: {{angle}}. Proof point: {{proofPoint}}. CTA: {{cta}}. Produce 3 post variants that are sharp, concrete, and anti-fluff. Each variant must open with a strong hook, stay concise, and sound like an opinionated technical founder rather than a generic marketer.',
          variables: {},
        },
        label: 'Founder X Post Prompt',
      },
      id: 'ai-prompt-constructor-founder-x-post',
      position: { x: 340, y: 250 },
    }),
    createTemplateActionNode('llm', {
      data: {
        config: {
          model: LLM_DEFAULTS.fastText,
          outputFormat: 'text',
          temperature: 0.5,
        },
        label: 'Generate X Post Variants',
      },
      id: 'ai-generate-founder-x-post',
      position: { x: 720, y: 250 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'postDraft',
        },
        label: 'Post Draft Output',
      },
      id: 'workflow-output-founder-x-post',
      position: { x: 1060, y: 250 },
    }),
  ],
};

const FOUNDER_X_THREAD_TEMPLATE: WorkflowTemplate = {
  category: 'generation',
  description:
    'Generate founder-led X threads with a strong hook, structured argument, and a CTA that earns attention',
  edges: [
    {
      id: 'edge-founder-thread-topic',
      source: 'workflow-input-founder-thread-topic',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-x-thread',
      targetHandle: 'topic',
    },
    {
      id: 'edge-founder-thread-thesis',
      source: 'workflow-input-founder-thread-thesis',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-x-thread',
      targetHandle: 'thesis',
    },
    {
      id: 'edge-founder-thread-proof',
      source: 'workflow-input-founder-thread-proof',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-x-thread',
      targetHandle: 'proofPoints',
    },
    {
      id: 'edge-founder-thread-cta',
      source: 'workflow-input-founder-thread-cta',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-x-thread',
      targetHandle: 'cta',
    },
    {
      id: 'edge-founder-thread-prompt-llm',
      source: 'ai-prompt-constructor-founder-x-thread',
      sourceHandle: 'prompt',
      target: 'ai-generate-founder-x-thread',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-founder-thread-output',
      source: 'ai-generate-founder-x-thread',
      sourceHandle: 'text',
      target: 'workflow-output-founder-x-thread',
      targetHandle: 'value',
    },
  ],
  icon: 'thread',
  id: 'founder-x-thread',
  inputVariables: [
    {
      key: 'topic',
      label: 'Topic',
      required: true,
      type: 'text',
    },
    {
      key: 'thesis',
      label: 'Thesis',
      required: true,
      type: 'text',
    },
    {
      key: 'proofPoints',
      label: 'Proof Points',
      required: false,
      type: 'text',
    },
    {
      key: 'cta',
      label: 'CTA',
      required: false,
      type: 'text',
    },
  ],
  name: 'Founder X Thread',
  nodes: [
    {
      data: {
        config: {
          inputName: 'topic',
          inputType: 'text',
          required: true,
        },
        label: 'Topic',
      },
      id: 'workflow-input-founder-thread-topic',
      position: { x: 0, y: 40 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'thesis',
          inputType: 'text',
          required: true,
        },
        label: 'Thesis',
      },
      id: 'workflow-input-founder-thread-thesis',
      position: { x: 0, y: 180 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'proofPoints',
          inputType: 'text',
          required: false,
        },
        label: 'Proof Points',
      },
      id: 'workflow-input-founder-thread-proof',
      position: { x: 0, y: 320 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'cta',
          inputType: 'text',
          required: false,
        },
        label: 'CTA',
      },
      id: 'workflow-input-founder-thread-cta',
      position: { x: 0, y: 460 },
      type: 'workflowInput',
    },
    createTemplateActionNode('promptConstructor', {
      data: {
        config: {
          template:
            'Write a founder-led X thread for Genfeed. Topic: {{topic}}. Thesis: {{thesis}}. Proof points: {{proofPoints}}. CTA: {{cta}}. Return a thread with a strong opening hook, a tight argument across 6 to 10 posts, and a closing CTA. Avoid generic AI platitudes and keep every post useful or surprising.',
          variables: {},
        },
        label: 'Founder X Thread Prompt',
      },
      id: 'ai-prompt-constructor-founder-x-thread',
      position: { x: 340, y: 250 },
    }),
    createTemplateActionNode('llm', {
      data: {
        config: {
          model: LLM_DEFAULTS.fastText,
          outputFormat: 'text',
          temperature: 0.45,
        },
        label: 'Generate X Thread',
      },
      id: 'ai-generate-founder-x-thread',
      position: { x: 720, y: 250 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'threadDraft',
        },
        label: 'Thread Draft Output',
      },
      id: 'workflow-output-founder-x-thread',
      position: { x: 1060, y: 250 },
    }),
  ],
};

const FOUNDER_NEWSLETTER_TEMPLATE: WorkflowTemplate = {
  category: 'generation',
  description:
    'Generate a founder-style newsletter draft from a thesis, source notes, and a concrete takeaway',
  edges: [
    {
      id: 'edge-founder-newsletter-topic',
      source: 'workflow-input-founder-newsletter-topic',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-newsletter',
      targetHandle: 'topic',
    },
    {
      id: 'edge-founder-newsletter-takeaway',
      source: 'workflow-input-founder-newsletter-takeaway',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-newsletter',
      targetHandle: 'coreTakeaway',
    },
    {
      id: 'edge-founder-newsletter-notes',
      source: 'workflow-input-founder-newsletter-notes',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-newsletter',
      targetHandle: 'sourceNotes',
    },
    {
      id: 'edge-founder-newsletter-cta',
      source: 'workflow-input-founder-newsletter-cta',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-newsletter',
      targetHandle: 'cta',
    },
    {
      id: 'edge-founder-newsletter-prompt-llm',
      source: 'ai-prompt-constructor-founder-newsletter',
      sourceHandle: 'prompt',
      target: 'ai-generate-founder-newsletter',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-founder-newsletter-output',
      source: 'ai-generate-founder-newsletter',
      sourceHandle: 'text',
      target: 'workflow-output-founder-newsletter',
      targetHandle: 'value',
    },
  ],
  icon: 'newsletter',
  id: 'founder-newsletter',
  inputVariables: [
    {
      key: 'topic',
      label: 'Topic',
      required: true,
      type: 'text',
    },
    {
      key: 'coreTakeaway',
      label: 'Core Takeaway',
      required: true,
      type: 'text',
    },
    {
      key: 'sourceNotes',
      label: 'Source Notes',
      required: false,
      type: 'text',
    },
    {
      key: 'cta',
      label: 'CTA',
      required: false,
      type: 'text',
    },
  ],
  name: 'Founder Newsletter',
  nodes: [
    {
      data: {
        config: {
          inputName: 'topic',
          inputType: 'text',
          required: true,
        },
        label: 'Topic',
      },
      id: 'workflow-input-founder-newsletter-topic',
      position: { x: 0, y: 40 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'coreTakeaway',
          inputType: 'text',
          required: true,
        },
        label: 'Core Takeaway',
      },
      id: 'workflow-input-founder-newsletter-takeaway',
      position: { x: 0, y: 180 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'sourceNotes',
          inputType: 'text',
          required: false,
        },
        label: 'Source Notes',
      },
      id: 'workflow-input-founder-newsletter-notes',
      position: { x: 0, y: 320 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'cta',
          inputType: 'text',
          required: false,
        },
        label: 'CTA',
      },
      id: 'workflow-input-founder-newsletter-cta',
      position: { x: 0, y: 460 },
      type: 'workflowInput',
    },
    createTemplateActionNode('promptConstructor', {
      data: {
        config: {
          template:
            'Write a founder-led newsletter draft for Genfeed. Topic: {{topic}}. Core takeaway: {{coreTakeaway}}. Source notes: {{sourceNotes}}. CTA: {{cta}}. Produce a concise but high-signal newsletter with a strong opening, a clear point of view, concrete observations, and a close that invites response or action. Do not sound like generic marketing automation copy.',
          variables: {},
        },
        label: 'Founder Newsletter Prompt',
      },
      id: 'ai-prompt-constructor-founder-newsletter',
      position: { x: 340, y: 250 },
    }),
    createTemplateActionNode('llm', {
      data: {
        config: {
          model: LLM_DEFAULTS.fastText,
          outputFormat: 'text',
          temperature: 0.4,
        },
        label: 'Generate Newsletter Draft',
      },
      id: 'ai-generate-founder-newsletter',
      position: { x: 720, y: 250 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'newsletterDraft',
        },
        label: 'Newsletter Draft Output',
      },
      id: 'workflow-output-founder-newsletter',
      position: { x: 1060, y: 250 },
    }),
  ],
};

const FOUNDER_EDITORIAL_ILLUSTRATION_TEMPLATE: WorkflowTemplate = {
  category: 'generation',
  description:
    'Generate editorial illustrations aligned to founder-led GTM content with clear visual direction and brand cues',
  edges: [
    {
      id: 'edge-founder-illustration-angle',
      source: 'workflow-input-founder-illustration-angle',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-illustration',
      targetHandle: 'visualAngle',
    },
    {
      id: 'edge-founder-illustration-style',
      source: 'workflow-input-founder-illustration-style',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-illustration',
      targetHandle: 'visualStyle',
    },
    {
      id: 'edge-founder-illustration-brand-cues',
      source: 'workflow-input-founder-illustration-brand-cues',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-illustration',
      targetHandle: 'brandCues',
    },
    {
      id: 'edge-founder-illustration-format',
      source: 'workflow-input-founder-illustration-format',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-founder-illustration',
      targetHandle: 'platformFormat',
    },
    {
      id: 'edge-founder-illustration-prompt-image',
      source: 'ai-prompt-constructor-founder-illustration',
      sourceHandle: 'prompt',
      target: 'ai-generate-founder-illustration',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-founder-illustration-output',
      source: 'ai-generate-founder-illustration',
      sourceHandle: 'image',
      target: 'workflow-output-founder-illustration',
      targetHandle: 'value',
    },
  ],
  icon: 'image',
  id: 'founder-editorial-illustration',
  inputVariables: [
    {
      key: 'visualAngle',
      label: 'Visual Angle',
      required: true,
      type: 'text',
    },
    {
      key: 'visualStyle',
      label: 'Visual Style',
      required: true,
      type: 'text',
    },
    {
      key: 'brandCues',
      label: 'Brand Cues',
      required: false,
      type: 'text',
    },
    {
      key: 'platformFormat',
      label: 'Platform Format',
      required: false,
      type: 'text',
    },
  ],
  name: 'Founder Editorial Illustration',
  nodes: [
    {
      data: {
        config: {
          inputName: 'visualAngle',
          inputType: 'text',
          required: true,
        },
        label: 'Visual Angle',
      },
      id: 'workflow-input-founder-illustration-angle',
      position: { x: 0, y: 40 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'visualStyle',
          inputType: 'text',
          required: true,
        },
        label: 'Visual Style',
      },
      id: 'workflow-input-founder-illustration-style',
      position: { x: 0, y: 180 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'brandCues',
          inputType: 'text',
          required: false,
        },
        label: 'Brand Cues',
      },
      id: 'workflow-input-founder-illustration-brand-cues',
      position: { x: 0, y: 320 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'platformFormat',
          inputType: 'text',
          required: false,
        },
        label: 'Platform Format',
      },
      id: 'workflow-input-founder-illustration-format',
      position: { x: 0, y: 460 },
      type: 'workflowInput',
    },
    createTemplateActionNode('promptConstructor', {
      data: {
        config: {
          template:
            'Create an editorial illustration prompt for founder-led GTM content. Visual angle: {{visualAngle}}. Visual style: {{visualStyle}}. Brand cues: {{brandCues}}. Platform format: {{platformFormat}}. The result should feel distinctive, modern, and message-led rather than generic AI art. Keep the composition clear enough for social and newsletter use.',
          variables: {},
        },
        label: 'Founder Illustration Prompt',
      },
      id: 'ai-prompt-constructor-founder-illustration',
      position: { x: 340, y: 250 },
    }),
    createTemplateActionNode('imageGen', {
      data: {
        config: {
          model: 'black-forest-labs/flux-2-pro',
          negativePrompt:
            'generic stock art, cluttered composition, irrelevant symbols, cheesy marketing visual, low detail, low contrast',
          style: 'editorial illustration with clear visual hierarchy',
        },
        label: 'Generate Editorial Illustration',
      },
      id: 'ai-generate-founder-illustration',
      position: { x: 720, y: 250 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'illustrationDraft',
        },
        label: 'Illustration Output',
      },
      id: 'workflow-output-founder-illustration',
      position: { x: 1060, y: 250 },
    }),
  ],
};

const YOUTUBE_THUMBNAIL_SCRIPT_TEMPLATE: WorkflowTemplate = {
  category: 'generation',
  description:
    'Generate three 16:9 YouTube thumbnail variations and a livestream/video script brief from a title, concept, audience, style, and optional reference image',
  edges: [
    {
      id: 'edge-youtube-title-thumbnail-prompt',
      source: 'workflow-input-youtube-title',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-youtube-thumbnail',
      targetHandle: 'titleText',
    },
    {
      id: 'edge-youtube-concept-thumbnail-prompt',
      source: 'workflow-input-youtube-concept',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-youtube-thumbnail',
      targetHandle: 'thumbnailConcept',
    },
    {
      id: 'edge-youtube-audience-thumbnail-prompt',
      source: 'workflow-input-youtube-audience',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-youtube-thumbnail',
      targetHandle: 'targetAudience',
    },
    {
      id: 'edge-youtube-style-thumbnail-prompt',
      source: 'workflow-input-youtube-style',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-youtube-thumbnail',
      targetHandle: 'visualStyle',
    },
    {
      id: 'edge-youtube-thumbnail-prompt-v1',
      source: 'ai-prompt-constructor-youtube-thumbnail',
      sourceHandle: 'prompt',
      target: 'ai-generate-youtube-thumbnail-v1',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-youtube-thumbnail-prompt-v2',
      source: 'ai-prompt-constructor-youtube-thumbnail',
      sourceHandle: 'prompt',
      target: 'ai-generate-youtube-thumbnail-v2',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-youtube-thumbnail-prompt-v3',
      source: 'ai-prompt-constructor-youtube-thumbnail',
      sourceHandle: 'prompt',
      target: 'ai-generate-youtube-thumbnail-v3',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-youtube-reference-v1',
      source: 'workflow-input-youtube-reference',
      sourceHandle: 'value',
      target: 'ai-generate-youtube-thumbnail-v1',
      targetHandle: 'image',
    },
    {
      id: 'edge-youtube-reference-v2',
      source: 'workflow-input-youtube-reference',
      sourceHandle: 'value',
      target: 'ai-generate-youtube-thumbnail-v2',
      targetHandle: 'image',
    },
    {
      id: 'edge-youtube-reference-v3',
      source: 'workflow-input-youtube-reference',
      sourceHandle: 'value',
      target: 'ai-generate-youtube-thumbnail-v3',
      targetHandle: 'image',
    },
    {
      id: 'edge-youtube-thumbnail-v1-output',
      source: 'ai-generate-youtube-thumbnail-v1',
      sourceHandle: 'image',
      target: 'workflow-output-youtube-thumbnail-v1',
      targetHandle: 'value',
    },
    {
      id: 'edge-youtube-thumbnail-v2-output',
      source: 'ai-generate-youtube-thumbnail-v2',
      sourceHandle: 'image',
      target: 'workflow-output-youtube-thumbnail-v2',
      targetHandle: 'value',
    },
    {
      id: 'edge-youtube-thumbnail-v3-output',
      source: 'ai-generate-youtube-thumbnail-v3',
      sourceHandle: 'image',
      target: 'workflow-output-youtube-thumbnail-v3',
      targetHandle: 'value',
    },
    {
      id: 'edge-youtube-title-script-prompt',
      source: 'workflow-input-youtube-title',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-youtube-script',
      targetHandle: 'titleText',
    },
    {
      id: 'edge-youtube-topic-script-prompt',
      source: 'workflow-input-youtube-topic',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-youtube-script',
      targetHandle: 'topicContext',
    },
    {
      id: 'edge-youtube-audience-script-prompt',
      source: 'workflow-input-youtube-audience',
      sourceHandle: 'value',
      target: 'ai-prompt-constructor-youtube-script',
      targetHandle: 'targetAudience',
    },
    {
      id: 'edge-youtube-script-prompt-llm',
      source: 'ai-prompt-constructor-youtube-script',
      sourceHandle: 'prompt',
      target: 'llm-youtube-script',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-youtube-script-output',
      source: 'llm-youtube-script',
      sourceHandle: 'text',
      target: 'workflow-output-youtube-script',
      targetHandle: 'value',
    },
  ],
  icon: 'youtube',
  id: 'youtube-thumbnail-script',
  inputVariables: [
    {
      key: 'titleText',
      label: 'Title Text',
      required: true,
      type: 'text',
    },
    {
      key: 'thumbnailConcept',
      label: 'Thumbnail Concept',
      required: true,
      type: 'text',
    },
    {
      defaultValue: 'YouTube viewers who decide in under two seconds',
      key: 'targetAudience',
      label: 'Target Audience',
      required: false,
      type: 'text',
    },
    {
      defaultValue:
        'high contrast creator thumbnail, bold clean typography, expressive face, clear focal point',
      key: 'visualStyle',
      label: 'Visual Style',
      required: false,
      type: 'text',
    },
    {
      key: 'referenceImage',
      label: 'Reference Image',
      required: false,
      type: 'image',
    },
    {
      key: 'topicContext',
      label: 'Topic Context',
      required: false,
      type: 'text',
    },
  ],
  name: 'YouTube Thumbnail and Script Generator',
  nodes: [
    {
      data: {
        config: {
          inputName: 'titleText',
          inputType: 'text',
          required: true,
        },
        label: 'Title Text',
      },
      id: 'workflow-input-youtube-title',
      position: { x: 0, y: 40 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'thumbnailConcept',
          inputType: 'text',
          required: true,
        },
        label: 'Thumbnail Concept',
      },
      id: 'workflow-input-youtube-concept',
      position: { x: 0, y: 180 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          defaultValue: 'YouTube viewers who decide in under two seconds',
          inputName: 'targetAudience',
          inputType: 'text',
          required: false,
        },
        label: 'Target Audience',
      },
      id: 'workflow-input-youtube-audience',
      position: { x: 0, y: 320 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          defaultValue:
            'high contrast creator thumbnail, bold clean typography, expressive face, clear focal point',
          inputName: 'visualStyle',
          inputType: 'text',
          required: false,
        },
        label: 'Visual Style',
      },
      id: 'workflow-input-youtube-style',
      position: { x: 0, y: 460 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'referenceImage',
          inputType: 'image',
          required: false,
        },
        label: 'Reference Image',
      },
      id: 'workflow-input-youtube-reference',
      position: { x: 0, y: 600 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'topicContext',
          inputType: 'text',
          required: false,
        },
        label: 'Topic Context',
      },
      id: 'workflow-input-youtube-topic',
      position: { x: 0, y: 740 },
      type: 'workflowInput',
    },
    createTemplateActionNode('promptConstructor', {
      data: {
        config: {
          template:
            'Create a YouTube thumbnail prompt for a 16:9 thumbnail. Title text to include: "{{titleText}}". Concept: {{thumbnailConcept}}. Target audience: {{targetAudience}}. Visual style: {{visualStyle}}. Keep the composition readable at small size, with one dominant subject, bold typography, clean negative space, emotional clarity, and no clutter. Generate a polished final thumbnail image, not a mockup.',
          variables: {},
        },
        label: 'Thumbnail Prompt',
      },
      id: 'ai-prompt-constructor-youtube-thumbnail',
      position: { x: 340, y: 240 },
    }),
    createTemplateActionNode('imageGen', {
      data: {
        config: {
          model: 'qwen/qwen-image',
          negativePrompt:
            'tiny unreadable text, clutter, muddy colors, extra words, misspelled words, distorted face, low contrast, generic stock photo, watermark, logo',
          style:
            'high-converting YouTube thumbnail with bold readable title text',
        },
        label: 'Thumbnail V1',
      },
      id: 'ai-generate-youtube-thumbnail-v1',
      position: { x: 720, y: 80 },
    }),
    createTemplateActionNode('imageGen', {
      data: {
        config: {
          model: 'qwen/qwen-image',
          negativePrompt:
            'tiny unreadable text, clutter, muddy colors, extra words, misspelled words, distorted face, low contrast, generic stock photo, watermark, logo',
          seed: 1107,
          style:
            'alternate high-converting YouTube thumbnail with strong contrast and a different layout',
        },
        label: 'Thumbnail V2',
      },
      id: 'ai-generate-youtube-thumbnail-v2',
      position: { x: 720, y: 280 },
    }),
    createTemplateActionNode('imageGen', {
      data: {
        config: {
          model: 'qwen/qwen-image',
          negativePrompt:
            'tiny unreadable text, clutter, muddy colors, extra words, misspelled words, distorted face, low contrast, generic stock photo, watermark, logo',
          seed: 2209,
          style:
            'alternate YouTube thumbnail concept with dramatic focal point and readable text hierarchy',
        },
        label: 'Thumbnail V3',
      },
      id: 'ai-generate-youtube-thumbnail-v3',
      position: { x: 720, y: 480 },
    }),
    createTemplateActionNode('promptConstructor', {
      data: {
        config: {
          template:
            'Write a concise YouTube livestream/video script brief for title "{{titleText}}". Topic context: {{topicContext}}. Audience: {{targetAudience}}. Include: opening hook, 5-7 talking points, retention beats, thumbnail/title rationale, audience engagement prompts, and a closing CTA.',
          variables: {},
        },
        label: 'Script Prompt',
      },
      id: 'ai-prompt-constructor-youtube-script',
      position: { x: 340, y: 760 },
    }),
    createTemplateActionNode('llm', {
      data: {
        config: {
          maxTokens: 1600,
          model: LLM_DEFAULTS.fastText,
          temperature: 0.7,
        },
        label: 'Script Brief',
      },
      id: 'llm-youtube-script',
      position: { x: 720, y: 760 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'thumbnailV1',
        },
        label: 'Thumbnail V1 Output',
      },
      id: 'workflow-output-youtube-thumbnail-v1',
      position: { x: 1080, y: 80 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'thumbnailV2',
        },
        label: 'Thumbnail V2 Output',
      },
      id: 'workflow-output-youtube-thumbnail-v2',
      position: { x: 1080, y: 280 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'thumbnailV3',
        },
        label: 'Thumbnail V3 Output',
      },
      id: 'workflow-output-youtube-thumbnail-v3',
      position: { x: 1080, y: 480 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {
          outputName: 'scriptBrief',
        },
        label: 'Script Brief Output',
      },
      id: 'workflow-output-youtube-script',
      position: { x: 1080, y: 760 },
    }),
  ],
};

export const GENERATION_WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  'avatar-ugc-heygen':
    AVATAR_UGC_WORKFLOW_TEMPLATE as unknown as WorkflowTemplate,
  'avatar-ugc-x-landscape-heygen':
    AVATAR_UGC_X_LANDSCAPE_WORKFLOW_TEMPLATE as unknown as WorkflowTemplate,
  'daily-image-generation': {
    category: 'generation',
    description: 'Generate AI images on a daily schedule',
    icon: 'image',
    id: 'daily-image-generation',
    name: 'Daily Image Generation',
    nodes: [
      {
        id: 'generate-image',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Generate AI Image',
          config: {
            actionId: 'imageGen',
            parameters: {
              height: 1024,
              model: 'imagen4', // Default model, user can override
              // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
              prompt: '${prompt}', // Template variable
              quality: 'high',
              style: 'photorealistic',
              width: 1024,
            },
          },
        },
      },
    ],
    edges: [],
  },
  'floor-plan-interior-preview': FLOOR_PLAN_INTERIOR_PREVIEW_TEMPLATE,
  'founder-editorial-illustration': FOUNDER_EDITORIAL_ILLUSTRATION_TEMPLATE,
  'founder-newsletter': FOUNDER_NEWSLETTER_TEMPLATE,
  'founder-x-post': FOUNDER_X_POST_TEMPLATE,
  'founder-x-thread': FOUNDER_X_THREAD_TEMPLATE,
  'motivational-quote-image': {
    category: 'generation',
    description: 'Generate a motivational quote image every day',
    icon: 'quote',
    id: 'motivational-quote-image',
    name: 'Daily Motivational Quote Image',
    nodes: [
      {
        id: 'generate-quote-article',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Generate Quote',
          inputVariableKeys: ['brandId'],
          config: {
            actionId: 'workflow.run-child',
            parameters: {
              childWorkflowId: 'article.generation',
              dto: {
                count: 1,
                prompt: 'Write one original motivational quote',
                targetWordCount: 2500,
                tone: 'inspirational',
              },
            },
          },
        },
      },
      {
        id: 'generate-quote-image',
        type: 'genfeedAction',
        position: { x: 280, y: 0 },
        data: {
          label: 'Generate Quote Image',
          config: {
            actionId: 'imageGen',
            parameters: {
              height: 1080,
              model: 'leonardo',
              prompt:
                // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
                'Beautiful inspirational background with text overlay: ${quote}',
              style: 'artistic',
              width: 1080,
            },
          },
        },
      },
    ],
    edges: [
      {
        id: 'generate-quote-article' + '-' + 'generate-quote-image',
        source: 'generate-quote-article',
        target: 'generate-quote-image',
      },
    ],
  },
  'scheduled-video-creation': {
    category: 'generation',
    description: 'Generate AI videos on a schedule',
    icon: 'video',
    id: 'scheduled-video-creation',
    name: 'Scheduled Video Creation',
    nodes: [
      {
        id: 'generate-video',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Generate AI Video',
          config: {
            actionId: 'videoGen',
            parameters: {
              duration: 5, // seconds
              fps: 30,
              model: 'klingai', // Default model
              // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
              prompt: '${prompt}',
              resolution: '1080p',
              style: 'cinematic',
            },
          },
        },
      },
    ],
    edges: [],
  },
  'social-media-video-series': {
    category: 'generation',
    description: 'Generate short-form video content for social media',
    icon: 'social',
    id: 'social-media-video-series',
    name: 'Social Media Video Series',
    nodes: [
      {
        id: 'generate-video-content',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Generate Short Video',
          config: {
            actionId: 'videoGen',
            parameters: {
              aspectRatio: '9:16', // Portrait for stories/reels
              duration: 15, // Perfect for social media
              model: 'klingai',
              // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
              prompt: '${prompt}',
              resolution: '1080p',
            },
          },
        },
      },
      {
        id: 'add-captions',
        type: 'genfeedAction',
        position: { x: 280, y: 0 },
        data: {
          label: 'Add Captions',
          config: {
            actionId: 'effect-captions',
            parameters: {
              fontSize: 'large',
              position: 'center',
              style: 'dynamic',
            },
          },
        },
      },
    ],
    edges: [
      {
        id: 'generate-video-content' + '-' + 'add-captions',
        source: 'generate-video-content',
        target: 'add-captions',
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
    nodes: [
      {
        id: 'generate-hook',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Generate Viral Hook',
          config: {
            actionId: 'hookGenerator',
            parameters: {
              hookFormula: 'person_conflict_resolution',
              // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
              niche: '${niche}',
              // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
              product: '${product}',
              toneStyle: 'storytelling',
            },
          },
        },
      },
      {
        id: 'generate-slides',
        type: 'genfeedAction',
        position: { x: 280, y: 0 },
        data: {
          label: 'Generate Slideshow Images',
          config: {
            actionId: 'generate_content_batch',
            parameters: {
              count: 6,
              platforms: ['tiktok'],
              style: 'slideshow',
            },
          },
        },
      },
      {
        id: 'overlay-hook-text',
        type: 'genfeedAction',
        position: { x: 560, y: 0 },
        data: {
          label: 'Add Hook Text to Slide 1',
          config: {
            actionId: 'effect-text-overlay',
            parameters: {
              fontSize: 72,
              fontWeight: 'black',
              position: 'center',
              slideIndex: 0,
              strokeColor: '#000000',
              strokeWidth: 3,
              textColor: '#FFFFFF',
            },
          },
        },
      },
      {
        id: 'generate-caption',
        type: 'genfeedAction',
        position: { x: 840, y: 0 },
        data: {
          label: 'Write TikTok Caption',
          config: {
            actionId: 'effect-captions',
            parameters: {
              hashtagCount: 5,
              includeCTA: true,
              includeEmojis: true,
              includeHashtags: true,
              platform: 'tiktok',
              tone: 'storytelling',
            },
          },
        },
      },
      {
        id: 'publish-tiktok',
        type: 'genfeedAction',
        position: { x: 1120, y: 0 },
        data: {
          label: 'Publish to TikTok',
          config: {
            actionId: 'publish',
            parameters: {
              platforms: ['tiktok'],
              schedule: 'immediate',
            },
          },
        },
      },
      {
        id: 'track-performance',
        type: 'genfeedAction',
        position: { x: 1400, y: 0 },
        data: {
          label: 'Track Hook Performance',
          config: {
            actionId: 'analyticsFeedback',
            parameters: {
              autoAnalyzeAfterHours: 24,
              trackingEnabled: true,
            },
          },
        },
      },
    ],
    edges: [
      {
        id: 'generate-hook' + '-' + 'generate-slides',
        source: 'generate-hook',
        target: 'generate-slides',
      },
      {
        id: 'generate-hook' + '-' + 'overlay-hook-text',
        source: 'generate-hook',
        target: 'overlay-hook-text',
      },
      {
        id: 'generate-slides' + '-' + 'overlay-hook-text',
        source: 'generate-slides',
        target: 'overlay-hook-text',
      },
      {
        id: 'generate-hook' + '-' + 'generate-caption',
        source: 'generate-hook',
        target: 'generate-caption',
      },
      {
        id: 'overlay-hook-text' + '-' + 'publish-tiktok',
        source: 'overlay-hook-text',
        target: 'publish-tiktok',
      },
      {
        id: 'generate-caption' + '-' + 'publish-tiktok',
        source: 'generate-caption',
        target: 'publish-tiktok',
      },
      {
        id: 'publish-tiktok' + '-' + 'track-performance',
        source: 'publish-tiktok',
        target: 'track-performance',
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
    nodes: [
      {
        id: 'generate-article',
        type: 'genfeedAction',
        position: { x: 0, y: 0 },
        data: {
          label: 'Generate AI Article',
          inputVariableKeys: ['brandId'],
          config: {
            actionId: 'workflow.run-child',
            parameters: {
              childWorkflowId: 'article.generation',
              dto: {
                count: 1,
                generateHeaderImage: true,
                keywords: [],
                // biome-ignore lint/suspicious/noTemplateCurlyInString: workflow template variable
                prompt: '${topic}',
                targetWordCount: 4000,
                tone: 'professional',
              },
            },
          },
        },
      },
    ],
    edges: [],
  },
  'youtube-thumbnail-script': YOUTUBE_THUMBNAIL_SCRIPT_TEMPLATE,
};
