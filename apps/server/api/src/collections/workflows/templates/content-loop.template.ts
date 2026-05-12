import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import { WorkflowStepCategory } from '@genfeedai/enums';

<<<<<<< HEAD
=======
/**
 * Content Loop Workflow Template
 *
 * Closed-loop automation: analytics feedback → trend discovery →
 * prompt construction → content generation → publish.
 *
 * Node graph:
 * [analyticsFeedback] --topTopics--> [trendTrigger].keywords
 *                     --bestPlatform--> [trendTrigger].platform
 * [trendTrigger]      --topic-------> [promptConstructor]
 * [brand]             --brandVoice--> [promptConstructor]
 * [promptConstructor] --prompt------> [textGen]
 * [textGen]           --content-----> [publish]
 */
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
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
<<<<<<< HEAD
      sourceHandle: 'voice',
=======
      sourceHandle: 'brandVoice',
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
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
<<<<<<< HEAD
      id: 'e-brand-publish',
      source: 'brand-context',
      sourceHandle: 'brandId',
      target: 'publish',
      targetHandle: 'brand',
    },
    {
=======
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
      id: 'e-gen-publish',
      source: 'text-gen',
      sourceHandle: 'content',
      target: 'publish',
<<<<<<< HEAD
      targetHandle: 'caption',
=======
      targetHandle: 'content',
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
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
<<<<<<< HEAD
      data: { config: { topN: 5, worstN: 3 }, label: 'Analytics Feedback' },
=======
      data: {
        config: { topN: 5, worstN: 3 },
        label: 'Analytics Feedback',
      },
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
      id: 'analytics-feedback',
      position: { x: 0, y: 0 },
      type: 'analytics-feedback',
    },
    {
<<<<<<< HEAD
      data: { config: {}, label: 'Brand Context' },
=======
      data: {
        config: {},
        label: 'Brand Context',
      },
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
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
<<<<<<< HEAD
        config: { includeHashtags: true, maxLength: 2200, tone: 'brand-voice' },
=======
        config: {
          includeHashtags: true,
          maxLength: 2200,
          tone: 'brand-voice',
        },
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
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
        config: {
<<<<<<< HEAD
          platforms: {
            facebook: false,
            instagram: false,
            linkedin: false,
            threads: false,
            tiktok: true,
            twitter: false,
            youtube: false,
          },
          schedule: { type: 'immediate' },
=======
          autoPost: false,
          schedulingMode: 'queue',
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
        },
        label: 'Publish',
      },
      id: 'publish',
      position: { x: 1600, y: 100 },
      type: 'output-publish',
    },
  ],
  steps: [
    {
<<<<<<< HEAD
      category: WorkflowStepCategory.PERFORMANCE_TRACK,
=======
      category: WorkflowStepCategory.TRIGGER,
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
      config: { topN: 5, worstN: 3 },
      id: 'step-analytics-feedback',
      name: 'Read Analytics',
    },
    {
<<<<<<< HEAD
      category: WorkflowStepCategory.WEBHOOK,
=======
      category: WorkflowStepCategory.TRIGGER,
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
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
<<<<<<< HEAD
      category: WorkflowStepCategory.GENERATE_HOOK,
=======
      category: WorkflowStepCategory.PROCESSING,
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
      config: { includeHashtags: true, tone: 'brand-voice' },
      dependsOn: ['step-trend-trigger'],
      id: 'step-prompt',
      name: 'Build Prompt',
    },
    {
<<<<<<< HEAD
      category: WorkflowStepCategory.GENERATE_ARTICLE,
=======
      category: WorkflowStepCategory.GENERATION,
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
      config: { model: 'openai/gpt-4o-mini', temperature: 0.8 },
      dependsOn: ['step-prompt'],
      id: 'step-generate',
      name: 'Generate Content',
    },
    {
<<<<<<< HEAD
      category: WorkflowStepCategory.PUBLISH,
      config: {
        platforms: {
          facebook: false,
          instagram: false,
          linkedin: false,
          threads: false,
          tiktok: true,
          twitter: false,
          youtube: false,
        },
        schedule: { type: 'immediate' },
      },
=======
      category: WorkflowStepCategory.OUTPUT,
      config: { autoPost: false, schedulingMode: 'queue' },
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
      dependsOn: ['step-generate'],
      id: 'step-publish',
      name: 'Publish',
    },
  ],
};
