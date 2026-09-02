import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';

export const CONTENT_LOOP_PROMPT_TEMPLATE =
  'Write a {{tone}} social caption about {{topic}}.\n\nBrand voice:\n{{brandVoice}}\n\nKeep it under {{maxLength}} characters.';

export const CONTENT_LOOP_TEMPLATE: WorkflowTemplate = {
  category: 'content',
  description:
    'Closed-loop content automation: read analytics → discover trends → generate on-brand content → publish. Repeats on schedule.',
  edges: [
    {
      id: 'e-feedback-trend',
      source: 'analytics-feedback',
      sourceHandle: 'topTopics',
      target: 'trend-trigger',
      targetHandle: 'keywords',
    },
    {
      id: 'e-feedback-platform',
      source: 'analytics-feedback',
      sourceHandle: 'bestPlatform',
      target: 'trend-trigger',
      targetHandle: 'platform',
    },
    {
      id: 'e-feedback-hooks',
      source: 'analytics-feedback',
      sourceHandle: 'topHooks',
      target: 'prompt-constructor',
      targetHandle: 'hooks',
    },
    {
      id: 'e-feedback-avoid',
      source: 'analytics-feedback',
      sourceHandle: 'worstTopics',
      target: 'prompt-constructor',
      targetHandle: 'avoid',
    },
    {
      id: 'e-feedback-schedule',
      source: 'analytics-feedback',
      sourceHandle: 'bestPostingTimes',
      target: 'publish',
      targetHandle: 'schedule',
    },
    {
      id: 'e-trend-prompt',
      source: 'trend-trigger',
      sourceHandle: 'topic',
      target: 'prompt-constructor',
      targetHandle: 'topic',
    },
    {
      id: 'e-brand-prompt',
      source: 'brand-context',
      sourceHandle: 'voice',
      target: 'prompt-constructor',
      targetHandle: 'brandVoice',
    },
    {
      // Prompt Constructor emits the prompt itself, not a keyed object, so the
      // whole output is delivered to the llm `prompt` handle.
      id: 'e-prompt-gen',
      source: 'prompt-constructor',
      target: 'text-gen',
      targetHandle: 'prompt',
    },
    {
      id: 'e-brand-publish',
      source: 'brand-context',
      sourceHandle: 'brandId',
      target: 'publish',
      targetHandle: 'brand',
    },
    {
      id: 'e-gen-publish',
      source: 'text-gen',
      sourceHandle: 'text',
      target: 'publish',
      targetHandle: 'caption',
    },
  ],
  icon: 'repeat',
  id: 'content-loop',
  inputVariables: [
    {
      defaultValue: 'tiktok',
      key: 'platform',
      label: 'Platform',
      required: true,
      type: 'select',
      validation: {
        options: [
          'tiktok',
          'instagram',
          'twitter',
          'youtube',
          'linkedin',
          'threads',
          'facebook',
        ],
      },
    },
    {
      defaultValue: 70,
      key: 'minViralScore',
      label: 'Min Viral Score',
      required: false,
      type: 'number',
      validation: { max: 100, min: 0 },
    },
  ],
  name: 'Content Loop',
  nodes: [
    createTemplateActionNode('analyticsFeedback', {
      data: { config: { topN: 5, worstN: 3 }, label: 'Analytics Feedback' },
      id: 'analytics-feedback',
      position: { x: 0, y: 0 },
    }),
    createTemplateActionNode('brandContext', {
      data: { config: {}, label: 'Brand Context' },
      id: 'brand-context',
      position: { x: 0, y: 200 },
    }),
    createTemplateActionNode('trendTrigger', {
      data: {
        config: {
          checkFrequency: '6hr',
          minViralScore: 70,
          platform: 'tiktok',
          trendType: 'hashtag',
        },
        inputVariableKeys: ['platform', 'minViralScore'],
        label: 'Trend Trigger',
      },
      id: 'trend-trigger',
      position: { x: 400, y: 0 },
    }),
    createTemplateActionNode('promptConstructor', {
      data: {
        config: {
          includeHashtags: true,
          maxLength: 2200,
          template: CONTENT_LOOP_PROMPT_TEMPLATE,
          tone: 'brand-voice',
        },
        label: 'Prompt Constructor',
      },
      id: 'prompt-constructor',
      position: { x: 800, y: 100 },
    }),
    createTemplateActionNode('llm', {
      data: {
        config: {
          maxTokens: 1024,
          model: LLM_DEFAULTS.fastText,
          temperature: 0.8,
        },
        label: 'Generate Content',
      },
      id: 'text-gen',
      position: { x: 1200, y: 100 },
    }),
    createTemplateActionNode('publish', {
      data: {
        config: {
          platforms: ['tiktok'],
          schedule: { type: 'immediate' },
        },
        label: 'Publish',
      },
      id: 'publish',
      position: { x: 1600, y: 100 },
    }),
  ],
};
