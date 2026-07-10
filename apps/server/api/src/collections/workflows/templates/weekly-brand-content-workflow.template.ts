import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export const WEEKLY_BRAND_CONTENT_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  category: 'content',
  description:
    'Collect the last 7 days of followed source posts, generate an AI thesis brief, create a newsletter draft, draft an X post, generate an image prompt and image ingredient, then attach the image to the post draft.',
  icon: 'sparkles',
  id: 'weekly-brand-ai-content-loop',
  inputVariables: [
    {
      description: 'Brand to use for source collection and generated drafts.',
      key: 'brandId',
      label: 'Brand ID',
      required: true,
      type: 'text',
    },
    {
      defaultValue: 'the brand',
      description: 'Human-readable brand label used in prompts.',
      key: 'brandLabel',
      label: 'Brand Label',
      required: false,
      type: 'text',
    },
    {
      defaultValue: '',
      description:
        'Optional connected platform credential for the social draft.',
      key: 'credentialId',
      label: 'Credential ID',
      required: false,
      type: 'text',
    },
    {
      defaultValue: 'UTC',
      key: 'timezone',
      label: 'Timezone',
      required: false,
      type: 'text',
    },
  ],
  isScheduleEnabled: false,
  name: 'Weekly Brand AI Content Loop',
  nodes: [
    {
      data: {
        config: { brandId: '', days: 7, limit: 50 },
        inputVariableKeys: ['brandId'],
        label: 'Collect Source Posts',
      },
      id: 'source-corpus',
      position: { x: 0, y: 220 },
      type: 'source-corpus',
    },
    {
      data: {
        config: {
          template:
            'You are preparing a weekly editorial thesis for a brand writing about AI and AI content generation.\n\nUse only the collected source posts below as evidence.\n\nSource posts:\n{{corpus}}\n\nReturn a structured brief with: 1) the strongest thesis, 2) supporting evidence, 3) contrarian angle, 4) newsletter outline, 5) one social post angle.',
          variables: {},
        },
        label: 'Build Thesis Prompt',
      },
      id: 'prompt-thesis-brief',
      position: { x: 360, y: 220 },
      type: 'ai-prompt-constructor',
    },
    {
      data: {
        config: {
          maxTokens: 1800,
          model: 'openai/gpt-4o-mini',
          temperature: 0.75,
        },
        label: 'Generate Thesis Brief',
      },
      id: 'llm-thesis-brief',
      position: { x: 720, y: 220 },
      type: 'ai-llm',
    },
    {
      data: {
        config: {
          brandId: '',
          brandLabel: 'the brand',
          instructions:
            'Use the thesis brief as the editorial basis. Produce a review-ready newsletter draft about AI and AI content generation.',
          prompt: 'Weekly AI content generation thesis brief',
          timezone: 'UTC',
        },
        inputVariableKeys: ['brandId', 'brandLabel', 'timezone'],
        label: 'Generate Newsletter Draft',
      },
      id: 'newsletter-draft',
      position: { x: 1080, y: 60 },
      type: 'ai-generate-newsletter',
    },
    {
      data: {
        config: {
          template:
            'Turn this weekly thesis brief into one X post for a founder/operator audience.\n\nBrief:\n{{brief}}\n\nConstraints: one post, direct point of view, no hashtags, no thread, under 260 characters.',
          variables: {},
        },
        label: 'Build X Post Prompt',
      },
      id: 'prompt-x-post',
      position: { x: 1080, y: 380 },
      type: 'ai-prompt-constructor',
    },
    {
      data: {
        config: {
          brandId: '',
          brandLabel: 'the brand',
          credentialId: '',
          platform: 'twitter',
          prompt: 'Draft an X post from the weekly AI thesis brief.',
          timezone: 'UTC',
        },
        inputVariableKeys: [
          'brandId',
          'brandLabel',
          'credentialId',
          'timezone',
        ],
        label: 'Generate X Draft',
      },
      id: 'x-post-draft',
      position: { x: 1440, y: 380 },
      type: 'ai-generate-post',
    },
    {
      data: {
        config: {
          template:
            'Create a concise image-generation prompt for this X post. The image should visualize the idea without text overlays, screenshots, logos, or UI.\n\nX post:\n{{tweet}}',
          variables: {},
        },
        label: 'Build Image Prompt',
      },
      id: 'prompt-image',
      position: { x: 1800, y: 380 },
      type: 'ai-prompt-constructor',
    },
    {
      data: {
        config: {
          maxTokens: 500,
          model: 'openai/gpt-4o-mini',
          temperature: 0.8,
        },
        label: 'Generate Image Prompt',
      },
      id: 'llm-image-prompt',
      position: { x: 2160, y: 380 },
      type: 'ai-llm',
    },
    {
      data: {
        config: {
          brandId: '',
          height: 1024,
          model: 'black-forest-labs/flux-2-pro',
          style: 'editorial, clean, high contrast',
          width: 1024,
        },
        inputVariableKeys: ['brandId'],
        label: 'Generate Image Ingredient',
      },
      id: 'image-ingredient',
      position: { x: 2520, y: 380 },
      type: 'ai-generate-image',
    },
    {
      data: {
        config: { brandId: '' },
        inputVariableKeys: ['brandId'],
        label: 'Attach Image to X Draft',
      },
      id: 'attach-image-to-post',
      position: { x: 2880, y: 380 },
      type: 'attach-post-ingredient',
    },
    {
      data: {
        config: { outputName: 'weeklyBrandContent' },
        label: 'Weekly Content Output',
      },
      id: 'workflow-output-weekly-content',
      position: { x: 3240, y: 380 },
      type: 'workflow-output',
    },
  ],
  edges: [
    {
      id: 'edge-corpus-to-thesis-prompt',
      source: 'source-corpus',
      sourceHandle: 'corpus',
      target: 'prompt-thesis-brief',
      targetHandle: 'corpus',
    },
    {
      id: 'edge-thesis-prompt-to-llm',
      source: 'prompt-thesis-brief',
      target: 'llm-thesis-brief',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-thesis-to-newsletter',
      source: 'llm-thesis-brief',
      sourceHandle: 'text',
      target: 'newsletter-draft',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-thesis-to-x-prompt',
      source: 'llm-thesis-brief',
      sourceHandle: 'text',
      target: 'prompt-x-post',
      targetHandle: 'brief',
    },
    {
      id: 'edge-x-prompt-to-post',
      source: 'prompt-x-post',
      target: 'x-post-draft',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-post-to-image-prompt',
      source: 'x-post-draft',
      sourceHandle: 'description',
      target: 'prompt-image',
      targetHandle: 'tweet',
    },
    {
      id: 'edge-image-prompt-to-llm',
      source: 'prompt-image',
      target: 'llm-image-prompt',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-llm-image-prompt-to-image',
      source: 'llm-image-prompt',
      sourceHandle: 'text',
      target: 'image-ingredient',
      targetHandle: 'prompt',
    },
    {
      id: 'edge-post-to-attach',
      source: 'x-post-draft',
      sourceHandle: 'id',
      target: 'attach-image-to-post',
      targetHandle: 'postId',
    },
    {
      id: 'edge-image-to-attach',
      source: 'image-ingredient',
      sourceHandle: 'id',
      target: 'attach-image-to-post',
      targetHandle: 'ingredientId',
    },
    {
      id: 'edge-attach-to-output',
      source: 'attach-image-to-post',
      target: 'workflow-output-weekly-content',
      targetHandle: 'value',
    },
  ],
  schedule: '0 9 * * 1',
  steps: [],
  timezone: 'UTC',
  version: 1,
};
