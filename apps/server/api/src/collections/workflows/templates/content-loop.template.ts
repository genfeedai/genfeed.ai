import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import { WorkflowStepCategory } from '@genfeedai/enums';

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
      id: 'e-trend-prompt',
      source: 'trend-trigger',
      sourceHandle: 'topic',
      target: 'prompt-constructor',
      targetHandle: 'topic',
    },
    {
      id: 'e-brand-prompt',
      source: 'brand-context',
      sourceHandle: 'brandVoice',
      target: 'prompt-constructor',
      targetHandle: 'brandVoice',
    },
    {
      id: 'e-prompt-gen',
      source: 'prompt-constructor',
      sourceHandle: 'prompt',
      target: 'text-gen',
      targetHandle: 'prompt',
    },
    {
      id: 'e-gen-publish',
      source: 'text-gen',
      sourceHandle: 'content',
      target: 'publish',
      targetHandle: 'content',
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
    {
      data: { config: { topN: 5, worstN: 3 }, label: 'Analytics Feedback' },
      id: 'analytics-feedback',
      position: { x: 0, y: 0 },
      type: 'analytics-feedback',
    },
    {
      data: { config: {}, label: 'Brand Context' },
      id: 'brand-context',
      position: { x: 0, y: 200 },
      type: 'brandContext',
    },
    {
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
      type: 'trendTrigger',
    },
    {
      data: {
        config: { includeHashtags: true, maxLength: 2200, tone: 'brand-voice' },
        label: 'Prompt Constructor',
      },
      id: 'prompt-constructor',
      position: { x: 800, y: 100 },
      type: 'ai-prompt-constructor',
    },
    {
      data: {
        config: {
          maxTokens: 1024,
          model: 'openai/gpt-4o-mini',
          temperature: 0.8,
        },
        label: 'Generate Content',
      },
      id: 'text-gen',
      position: { x: 1200, y: 100 },
      type: 'ai-llm',
    },
    {
      data: {
        config: { autoPost: false, schedulingMode: 'queue' },
        label: 'Publish',
      },
      id: 'publish',
      position: { x: 1600, y: 100 },
      type: 'output-publish',
    },
  ],
  steps: [
    {
      category: WorkflowStepCategory.TRIGGER,
      config: { topN: 5, worstN: 3 },
      id: 'step-analytics-feedback',
      name: 'Read Analytics',
    },
    {
      category: WorkflowStepCategory.TRIGGER,
      config: {
        checkFrequency: '6hr',
        minViralScore: 70,
        trendType: 'hashtag',
      },
      dependsOn: ['step-analytics-feedback'],
      id: 'step-trend-trigger',
      name: 'Find Matching Trend',
    },
    {
      category: WorkflowStepCategory.PROCESSING,
      config: { includeHashtags: true, tone: 'brand-voice' },
      dependsOn: ['step-trend-trigger'],
      id: 'step-prompt',
      name: 'Build Prompt',
    },
    {
      category: WorkflowStepCategory.GENERATION,
      config: { model: 'openai/gpt-4o-mini', temperature: 0.8 },
      dependsOn: ['step-prompt'],
      id: 'step-generate',
      name: 'Generate Content',
    },
    {
      category: WorkflowStepCategory.OUTPUT,
      config: { autoPost: false, schedulingMode: 'queue' },
      dependsOn: ['step-generate'],
      id: 'step-publish',
      name: 'Publish',
    },
  ],
};
