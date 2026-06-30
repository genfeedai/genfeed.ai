import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import { WorkflowStepCategory } from '@genfeedai/enums';

const DEFAULT_REVIEW_GATE = {
  enabled: true,
  mode: 'manual' as const,
  requiredBeforePublish: true,
};

export const DAILY_TREND_LOOP_TEMPLATE: WorkflowTemplate = {
  category: 'routines',
  description:
    'Daily operating loop for finding a relevant trend, turning it into an on-brand post prompt, and tracking review and publish status.',
  edges: [
    {
      id: 'edge-brand-focus-prompt',
      source: 'input-brand-focus',
      sourceHandle: 'value',
      target: 'prompt-daily-trend-loop',
      targetHandle: 'brandFocus',
    },
    {
      id: 'edge-platform-prompt',
      source: 'input-platform',
      sourceHandle: 'value',
      target: 'prompt-daily-trend-loop',
      targetHandle: 'platform',
    },
    {
      id: 'edge-brand-voice-prompt',
      source: 'brand-context',
      sourceHandle: 'voice',
      target: 'prompt-daily-trend-loop',
      targetHandle: 'brandVoice',
    },
    {
      id: 'edge-prompt-output',
      source: 'prompt-daily-trend-loop',
      sourceHandle: 'prompt',
      target: 'output-daily-trend-brief',
      targetHandle: 'value',
    },
  ],
  icon: 'repeat',
  id: 'daily-trend-loop',
  inputVariables: [
    {
      defaultValue: '',
      description: 'The product, campaign, or audience the trend should serve.',
      key: 'brandFocus',
      label: 'Brand Focus',
      required: true,
      type: 'text',
    },
    {
      defaultValue: 'linkedin',
      description: 'Primary platform for the generated post.',
      key: 'platform',
      label: 'Platform',
      required: true,
      type: 'select',
      validation: {
        options: ['linkedin', 'twitter', 'threads', 'instagram', 'tiktok'],
      },
    },
    {
      defaultValue: 70,
      description: 'Minimum trend score before the routine should draft work.',
      key: 'minTrendScore',
      label: 'Minimum Trend Score',
      required: false,
      type: 'number',
      validation: { max: 100, min: 0 },
    },
  ],
  name: 'Daily Trend Loop',
  nodes: [
    {
      data: {
        config: {
          inputName: 'brandFocus',
          inputType: 'text',
          required: true,
        },
        label: 'Brand Focus',
      },
      id: 'input-brand-focus',
      position: { x: 0, y: 80 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'platform',
          inputType: 'text',
          required: true,
        },
        label: 'Platform',
      },
      id: 'input-platform',
      position: { x: 0, y: 240 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {},
        label: 'Brand Context',
      },
      id: 'brand-context',
      position: { x: 320, y: 80 },
      type: 'brandContext',
    },
    {
      data: {
        config: {
          template:
            'Build today\'s trend brief for {{platform}}. Use brand focus "{{brandFocus}}" and brand voice "{{brandVoice}}". Return: trend angle, why it matters today, post draft, visual idea, review checklist, and publish recommendation. Keep the draft native to the platform and avoid unsupported claims.',
          variables: {},
        },
        label: 'Daily Trend Brief',
      },
      id: 'prompt-daily-trend-loop',
      position: { x: 680, y: 160 },
      type: 'promptConstructor',
    },
    {
      data: {
        config: {
          outputName: 'dailyTrendBrief',
        },
        label: 'Trend Brief Output',
      },
      id: 'output-daily-trend-brief',
      position: { x: 1080, y: 160 },
      type: 'workflowOutput',
    },
  ],
  routine: {
    defaultSchedule: '0 8 * * *',
    defaultScheduleEnabled: true,
    defaultTimezone: 'UTC',
    inputContract: [
      {
        description:
          'What this daily trend pass should help sell, teach, or test.',
        key: 'brandFocus',
        label: 'Brand Focus',
        required: true,
      },
      {
        description: 'The platform whose native format should shape the draft.',
        key: 'platform',
        label: 'Platform',
        required: true,
      },
      {
        description: 'Minimum trend quality threshold for drafting.',
        key: 'minTrendScore',
        label: 'Minimum Trend Score',
        required: false,
      },
    ],
    outputDestinations: ['Tasks', 'Workflow output', 'Publisher queue'],
    recommendedSkills: ['brand-voice', 'trend-remix', 'platform-native-hooks'],
    requiredSkills: ['brand-context', 'content-review'],
    reviewGateDefaults: DEFAULT_REVIEW_GATE,
    trackingTasks: [
      {
        description:
          'Confirm the input contract and platform defaults before the first scheduled run.',
        id: 'confirm-inputs',
        priority: 'high',
        status: 'todo',
        title: 'Confirm Daily Trend Loop inputs',
      },
      {
        description:
          'Review the first generated trend brief and request changes before publishing.',
        id: 'review-first-brief',
        priority: 'high',
        status: 'todo',
        title: 'Review first Daily Trend Loop brief',
      },
      {
        description:
          'Check whether the generated post was scheduled, published, or intentionally skipped.',
        id: 'publish-check',
        priority: 'medium',
        status: 'todo',
        title: 'Track Daily Trend Loop publish status',
      },
    ],
  },
  steps: [
    {
      category: WorkflowStepCategory.GENERATE_HOOK,
      config: { platform: 'linkedin', reviewGate: DEFAULT_REVIEW_GATE },
      id: 'step-daily-trend-brief',
      name: 'Draft Daily Trend Brief',
    },
    {
      category: WorkflowStepCategory.PUBLISH,
      config: { schedule: { type: 'scheduled' } },
      dependsOn: ['step-daily-trend-brief'],
      id: 'step-track-publish',
      name: 'Track Publish Decision',
    },
  ],
};

export const RELEASE_LOOP_TEMPLATE: WorkflowTemplate = {
  category: 'routines',
  description:
    'Launch-day routine for turning a product release into announcements, review tasks, scheduled posts, and measurement follow-up.',
  edges: [
    {
      id: 'edge-release-name-prompt',
      source: 'input-release-name',
      sourceHandle: 'value',
      target: 'prompt-release-loop',
      targetHandle: 'releaseName',
    },
    {
      id: 'edge-release-notes-prompt',
      source: 'input-release-notes',
      sourceHandle: 'value',
      target: 'prompt-release-loop',
      targetHandle: 'releaseNotes',
    },
    {
      id: 'edge-brand-release-prompt',
      source: 'brand-context',
      sourceHandle: 'voice',
      target: 'prompt-release-loop',
      targetHandle: 'brandVoice',
    },
    {
      id: 'edge-release-output',
      source: 'prompt-release-loop',
      sourceHandle: 'prompt',
      target: 'output-release-kit',
      targetHandle: 'value',
    },
  ],
  icon: 'rocket',
  id: 'release-loop',
  inputVariables: [
    {
      defaultValue: '',
      description: 'User-facing release or feature name.',
      key: 'releaseName',
      label: 'Release Name',
      required: true,
      type: 'text',
    },
    {
      defaultValue: '',
      description: 'Raw release notes, changelog bullets, or launch context.',
      key: 'releaseNotes',
      label: 'Release Notes',
      required: true,
      type: 'text',
    },
    {
      defaultValue: 'linkedin',
      description: 'Primary announcement channel.',
      key: 'primaryChannel',
      label: 'Primary Channel',
      required: true,
      type: 'select',
      validation: {
        options: ['linkedin', 'twitter', 'threads', 'newsletter', 'blog'],
      },
    },
  ],
  name: 'Release Loop',
  nodes: [
    {
      data: {
        config: {
          inputName: 'releaseName',
          inputType: 'text',
          required: true,
        },
        label: 'Release Name',
      },
      id: 'input-release-name',
      position: { x: 0, y: 80 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'releaseNotes',
          inputType: 'text',
          required: true,
        },
        label: 'Release Notes',
      },
      id: 'input-release-notes',
      position: { x: 0, y: 240 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {},
        label: 'Brand Context',
      },
      id: 'brand-context',
      position: { x: 320, y: 80 },
      type: 'brandContext',
    },
    {
      data: {
        config: {
          template:
            'Create a release loop kit for "{{releaseName}}" using release notes "{{releaseNotes}}" and brand voice "{{brandVoice}}". Return: launch narrative, primary announcement, short social variants, visual brief, approval checklist, publish checklist, and 7-day measurement plan.',
          variables: {},
        },
        label: 'Release Kit',
      },
      id: 'prompt-release-loop',
      position: { x: 680, y: 160 },
      type: 'promptConstructor',
    },
    {
      data: {
        config: {
          outputName: 'releaseKit',
        },
        label: 'Release Kit Output',
      },
      id: 'output-release-kit',
      position: { x: 1080, y: 160 },
      type: 'workflowOutput',
    },
  ],
  routine: {
    inputContract: [
      {
        description: 'User-facing name for the thing being launched.',
        key: 'releaseName',
        label: 'Release Name',
        required: true,
      },
      {
        description:
          'Raw notes or context the routine should transform into launch assets.',
        key: 'releaseNotes',
        label: 'Release Notes',
        required: true,
      },
      {
        description: 'Main channel that sets the announcement format.',
        key: 'primaryChannel',
        label: 'Primary Channel',
        required: true,
      },
    ],
    outputDestinations: [
      'Tasks',
      'Workflow output',
      'Publisher queue',
      'Analytics follow-up',
    ],
    recommendedSkills: [
      'launch-copy',
      'founder-voice',
      'performance-retrospective',
    ],
    requiredSkills: ['brand-context', 'content-review'],
    reviewGateDefaults: DEFAULT_REVIEW_GATE,
    trackingTasks: [
      {
        description:
          'Confirm release inputs, audience, and primary channel before generating launch assets.',
        id: 'confirm-release-inputs',
        priority: 'high',
        status: 'todo',
        title: 'Confirm Release Loop inputs',
      },
      {
        description:
          'Approve or request changes on announcement copy before scheduling.',
        id: 'approve-release-kit',
        priority: 'high',
        status: 'todo',
        title: 'Review Release Loop kit',
      },
      {
        description:
          'Confirm launch assets are scheduled or published on the selected destinations.',
        id: 'publish-release-assets',
        priority: 'medium',
        status: 'todo',
        title: 'Track Release Loop publish status',
      },
      {
        description:
          'Review seven-day performance and capture reusable feedback for future launches.',
        id: 'measure-release',
        priority: 'medium',
        status: 'todo',
        title: 'Measure Release Loop performance',
      },
    ],
  },
  steps: [
    {
      category: WorkflowStepCategory.GENERATE_ARTICLE,
      config: { reviewGate: DEFAULT_REVIEW_GATE },
      id: 'step-release-kit',
      name: 'Draft Release Kit',
    },
    {
      category: WorkflowStepCategory.PUBLISH,
      config: { schedule: { type: 'scheduled' } },
      dependsOn: ['step-release-kit'],
      id: 'step-release-publish',
      name: 'Track Launch Publishing',
    },
    {
      category: WorkflowStepCategory.PERFORMANCE_TRACK,
      config: { windowDays: 7 },
      dependsOn: ['step-release-publish'],
      id: 'step-release-measure',
      name: 'Measure Release',
    },
  ],
};

export const PRODUCTIZED_ROUTINE_TEMPLATES: Record<string, WorkflowTemplate> = {
  [DAILY_TREND_LOOP_TEMPLATE.id]: DAILY_TREND_LOOP_TEMPLATE,
  [RELEASE_LOOP_TEMPLATE.id]: RELEASE_LOOP_TEMPLATE,
};
