import {
  ContentTemplateKey,
  PromptTemplateKey,
  TemplateCategory,
} from '@genfeedai/contracts';

export interface PlatformTemplateVariable {
  description: string;
  label: string;
  name: string;
  required: boolean;
  type: 'text';
}

export interface PlatformTemplateDefinition {
  category: TemplateCategory;
  content: string;
  description: string;
  key: string;
  label: string;
  tags: string[];
  variables: PlatformTemplateVariable[];
}

const PROMPT_VARIABLE: PlatformTemplateVariable = {
  description: 'The prompt the user typed',
  label: 'Prompt',
  name: 'prompt',
  required: true,
  type: 'text',
};

/**
 * The platform defaults `PromptBuilderService` resolves for each model
 * category. They pass the prompt through unchanged (triple braces: no HTML
 * escaping), so seeding them keeps generation exactly as it was while making
 * the keys visible, and overridable per organization.
 */
export const PLATFORM_TEMPLATES: readonly PlatformTemplateDefinition[] = [
  {
    category: TemplateCategory.VIDEO,
    content: '{{{prompt}}}',
    description: 'Default video prompt. Passes the prompt through unchanged.',
    key: ContentTemplateKey.VIDEO_DEFAULT,
    label: 'Video default',
    tags: ['system', 'video'],
    variables: [PROMPT_VARIABLE],
  },
  {
    category: TemplateCategory.IMAGE,
    content: '{{{prompt}}}',
    description: 'Default image prompt. Passes the prompt through unchanged.',
    key: ContentTemplateKey.IMAGE_DEFAULT,
    label: 'Image default',
    tags: ['system', 'image'],
    variables: [PROMPT_VARIABLE],
  },
  {
    category: TemplateCategory.MUSIC_GENERATION,
    content: '{{{prompt}}}',
    description: 'Default music prompt. Passes the prompt through unchanged.',
    key: ContentTemplateKey.MUSIC_DEFAULT,
    label: 'Music default',
    tags: ['system', 'music'],
    variables: [PROMPT_VARIABLE],
  },
  {
    category: TemplateCategory.CAPTION,
    content: '{{{prompt}}}',
    description: 'Default text prompt. Passes the prompt through unchanged.',
    key: PromptTemplateKey.TEXT_DEFAULT,
    label: 'Text default',
    tags: ['system', 'text'],
    variables: [PROMPT_VARIABLE],
  },
];
