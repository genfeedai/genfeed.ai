import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export const RESEARCH_TO_CONTENT_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  category: 'content',
  changeSummary:
    'Search brand Knowledge and generate one cited social draft. Never publishes.',
  description:
    'Search the brand Knowledge library, then generate a draft post grounded in cited passages. The brand is bound at install time.',
  icon: 'book-open',
  id: 'research-to-content',
  inputVariables: [
    {
      description: 'What the draft should answer or cover.',
      key: 'query',
      label: 'Query',
      required: true,
      type: 'text',
    },
    {
      defaultValue: 'twitter',
      description: 'Social platform for the draft account.',
      key: 'platform',
      label: 'Platform',
      required: false,
      type: 'text',
    },
    {
      defaultValue: '',
      description:
        'Optional connected platform credential. When empty, the brand platform target is used.',
      key: 'credentialId',
      label: 'Credential ID',
      required: false,
      type: 'text',
    },
    {
      defaultValue: 'the brand',
      description: 'Human-readable brand label used in the draft prompt.',
      key: 'brandLabel',
      label: 'Brand Label',
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
  name: 'Research to Content',
  version: 1,
  nodes: [
    createTemplateActionNode('search_knowledge', {
      data: {
        config: {},
        inputVariableKeys: ['query'],
        label: 'Search Knowledge',
      },
      id: 'search-knowledge',
      position: { x: 0, y: 160 },
    }),
    createTemplateActionNode('postGen', {
      data: {
        config: {
          brandLabel: 'the brand',
          credentialId: '',
          platform: 'twitter',
          prompt: 'Write a social draft grounded in the cited Knowledge.',
          timezone: 'UTC',
        },
        inputVariableKeys: [
          'brandLabel',
          'credentialId',
          'platform',
          'timezone',
        ],
        label: 'Generate Draft',
      },
      id: 'generate-draft',
      position: { x: 360, y: 160 },
    }),
    createTemplateActionNode('workflow.collect-output', {
      data: {
        config: {},
        label: 'Collect Draft',
      },
      id: 'collect-output',
      position: { x: 720, y: 160 },
    }),
  ],
  edges: [
    {
      id: 'edge-search-to-post',
      source: 'search-knowledge',
      sourceHandle: 'data',
      target: 'generate-draft',
      targetHandle: 'knowledge',
    },
    {
      id: 'edge-post-to-output',
      source: 'generate-draft',
      target: 'collect-output',
      targetHandle: 'value',
    },
  ],
};
