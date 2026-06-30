import type {
  ProductizedRoutineMetadata,
  WorkflowTemplate,
} from '@api/collections/workflows/templates/workflow-templates';
import { WorkflowStepCategory } from '@genfeedai/enums';

export type ProductizedRoutineWorkflowTemplate = WorkflowTemplate & {
  isScheduleEnabled: true;
  routine: ProductizedRoutineMetadata;
  schedule: string;
  timezone: string;
};

const DAILY_REVIEW_DEFAULTS = {
  autoApproveIfNoResponse: false,
  notifyChannels: ['task-inbox'],
  requireApproval: true,
  reviewState: 'pending_approval',
  timeoutHours: 24,
} satisfies ProductizedRoutineMetadata['reviewDefaults'];

const dailyTrendInputContract = [
  {
    defaultValue: ['tiktok', 'instagram', 'youtube', 'twitter'],
    description: 'Social platforms to scan for trend candidates.',
    key: 'platforms',
    label: 'Platforms',
    required: true,
    type: 'select',
  },
  {
    defaultValue: 70,
    description: 'Minimum viral score for trends included in the daily brief.',
    key: 'minViralScore',
    label: 'Minimum Viral Score',
    required: false,
    type: 'number',
  },
  {
    defaultValue: 5,
    description: 'Maximum number of trend candidates included in the brief.',
    key: 'topN',
    label: 'Trend Count',
    required: false,
    type: 'number',
  },
] satisfies ProductizedRoutineMetadata['inputContract'];

const releaseLoopInputContract = [
  {
    defaultValue: '',
    description: 'Name of the product, feature, campaign, or release.',
    key: 'releaseName',
    label: 'Release Name',
    required: true,
    type: 'text',
  },
  {
    defaultValue: 'Product marketers and existing users',
    description: 'Primary audience for launch copy and review.',
    key: 'audience',
    label: 'Audience',
    required: true,
    type: 'text',
  },
  {
    defaultValue: 'social',
    description: 'Primary distribution lane for the release loop output.',
    key: 'primaryChannel',
    label: 'Primary Channel',
    required: true,
    type: 'select',
  },
  {
    defaultValue: '',
    description: 'Launch notes, changelog URL, or internal release brief.',
    key: 'releaseNotes',
    label: 'Release Notes',
    required: false,
    type: 'text',
  },
] satisfies ProductizedRoutineMetadata['inputContract'];

export const PRODUCTIZED_DAILY_ROUTINE_TEMPLATES = [
  {
    category: 'routines',
    description:
      'Daily trend brief, review gate, and digest handoff for choosing what to create next.',
    icon: 'repeat',
    id: 'daily-trend-loop',
    inputVariables: dailyTrendInputContract,
    isScheduleEnabled: true,
    name: 'Daily Trend Loop',
    nodes: [
      {
        data: {
          config: {
            minViralScore: 70,
            platforms: ['tiktok', 'instagram', 'youtube', 'twitter'],
            topN: 5,
          },
          label: 'Assemble Daily Trend Brief',
        },
        id: 'trend-digest',
        position: { x: 0, y: 120 },
        type: 'trendDigest',
      },
      {
        data: {
          config: DAILY_REVIEW_DEFAULTS,
          label: 'Review Trend Brief',
        },
        id: 'review-trend-brief',
        position: { x: 360, y: 120 },
        type: 'reviewGate',
      },
      {
        data: {
          config: {},
          label: 'Email Approved Digest',
        },
        id: 'send-approved-digest',
        position: { x: 720, y: 120 },
        type: 'sendEmail',
      },
      {
        data: {
          config: {
            outputName: 'trendBrief',
          },
          label: 'Trend Brief Output',
        },
        id: 'workflow-output-trend-brief',
        position: { x: 1080, y: 120 },
        type: 'workflow-output',
      },
    ],
    edges: [
      {
        id: 'edge-trend-html-to-review',
        source: 'trend-digest',
        sourceHandle: 'html',
        target: 'review-trend-brief',
        targetHandle: 'caption',
      },
      {
        id: 'edge-digest-to',
        source: 'trend-digest',
        sourceHandle: 'to',
        target: 'send-approved-digest',
        targetHandle: 'to',
      },
      {
        id: 'edge-digest-subject',
        source: 'trend-digest',
        sourceHandle: 'subject',
        target: 'send-approved-digest',
        targetHandle: 'subject',
      },
      {
        id: 'edge-review-html-to-email',
        source: 'review-trend-brief',
        sourceHandle: 'caption',
        target: 'send-approved-digest',
        targetHandle: 'html',
      },
      {
        id: 'edge-review-output',
        source: 'review-trend-brief',
        sourceHandle: 'caption',
        target: 'workflow-output-trend-brief',
        targetHandle: 'value',
      },
    ],
    routine: {
      cadence: 'daily',
      inputContract: dailyTrendInputContract,
      kind: 'productized-daily-routine',
      outputDestinations: [
        {
          key: 'trendBrief',
          label: 'Approved trend brief',
          required: true,
          type: 'workflow_output',
        },
        {
          key: 'emailDigest',
          label: 'Email digest to owner',
          required: true,
          type: 'email',
        },
        {
          key: 'reviewTask',
          label: 'Trend brief review task',
          required: true,
          type: 'task',
        },
      ],
      parentIssue: 224,
      recommendedSkills: [
        'content-strategist',
        'content-atomizer',
        'content-reviewer',
      ],
      requiredSkills: ['content-strategist', 'content-reviewer'],
      reviewDefaults: DAILY_REVIEW_DEFAULTS,
      sourceIssue: 976,
      trackingTasks: [
        {
          description:
            'Review the generated trend brief and choose the trend to turn into content.',
          key: 'review-trend-brief',
          outputType: 'post',
          priority: 'medium',
          reviewState: 'pending_approval',
          status: 'in_review',
          title: 'Review daily trend brief',
        },
        {
          description:
            'Create a content task from the selected trend and preferred platform.',
          key: 'create-from-trend',
          outputType: 'post',
          priority: 'medium',
          reviewState: 'pending_approval',
          status: 'todo',
          title: 'Create from selected trend',
        },
      ],
      version: 1,
    },
    schedule: '0 8 * * *',
    steps: [
      {
        category: WorkflowStepCategory.PERFORMANCE_TRACK,
        config: {
          minViralScore: 70,
          platforms: ['tiktok', 'instagram', 'youtube', 'twitter'],
          topN: 5,
        },
        id: 'assemble-trend-brief',
        name: 'Assemble Trend Brief',
      },
      {
        category: WorkflowStepCategory.WEBHOOK,
        config: DAILY_REVIEW_DEFAULTS,
        dependsOn: ['assemble-trend-brief'],
        id: 'review-trend-brief',
        name: 'Review Trend Brief',
      },
    ],
    timezone: 'UTC',
  },
  {
    category: 'routines',
    description:
      'Daily launch copy and review loop for turning release notes into approved distribution assets.',
    icon: 'rocket',
    id: 'release-loop',
    inputVariables: releaseLoopInputContract,
    isScheduleEnabled: true,
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
        id: 'workflow-input-release-name',
        position: { x: 0, y: 40 },
        type: 'workflow-input',
      },
      {
        data: {
          config: {
            inputName: 'audience',
            inputType: 'text',
            required: true,
          },
          label: 'Audience',
        },
        id: 'workflow-input-audience',
        position: { x: 0, y: 180 },
        type: 'workflow-input',
      },
      {
        data: {
          config: {
            inputName: 'releaseNotes',
            inputType: 'text',
            required: false,
          },
          label: 'Release Notes',
        },
        id: 'workflow-input-release-notes',
        position: { x: 0, y: 320 },
        type: 'workflow-input',
      },
      {
        data: {
          config: {
            template:
              'Create a daily release loop brief for {{releaseName}}. Audience: {{audience}}. Notes: {{releaseNotes}}. Return: launch angle, social draft, newsletter blurb, review checklist, and next tracking task.',
            variables: {},
          },
          label: 'Build Release Prompt',
        },
        id: 'prompt-constructor-release-loop',
        position: { x: 360, y: 180 },
        type: 'ai-prompt-constructor',
      },
      {
        data: {
          config: {
            maxTokens: 1400,
            model: 'openai/gpt-4o-mini',
            temperature: 0.7,
          },
          label: 'Draft Release Assets',
        },
        id: 'llm-release-assets',
        position: { x: 720, y: 180 },
        type: 'llm',
      },
      {
        data: {
          config: DAILY_REVIEW_DEFAULTS,
          label: 'Review Release Assets',
        },
        id: 'review-release-assets',
        position: { x: 1080, y: 180 },
        type: 'reviewGate',
      },
      {
        data: {
          config: {
            outputName: 'releaseAssets',
          },
          label: 'Release Assets Output',
        },
        id: 'workflow-output-release-assets',
        position: { x: 1440, y: 180 },
        type: 'workflow-output',
      },
    ],
    edges: [
      {
        id: 'edge-release-name-to-prompt',
        source: 'workflow-input-release-name',
        sourceHandle: 'value',
        target: 'prompt-constructor-release-loop',
        targetHandle: 'releaseName',
      },
      {
        id: 'edge-audience-to-prompt',
        source: 'workflow-input-audience',
        sourceHandle: 'value',
        target: 'prompt-constructor-release-loop',
        targetHandle: 'audience',
      },
      {
        id: 'edge-notes-to-prompt',
        source: 'workflow-input-release-notes',
        sourceHandle: 'value',
        target: 'prompt-constructor-release-loop',
        targetHandle: 'releaseNotes',
      },
      {
        id: 'edge-prompt-to-llm',
        source: 'prompt-constructor-release-loop',
        sourceHandle: 'prompt',
        target: 'llm-release-assets',
        targetHandle: 'prompt',
      },
      {
        id: 'edge-llm-to-review',
        source: 'llm-release-assets',
        sourceHandle: 'text',
        target: 'review-release-assets',
        targetHandle: 'caption',
      },
      {
        id: 'edge-review-to-output',
        source: 'review-release-assets',
        sourceHandle: 'caption',
        target: 'workflow-output-release-assets',
        targetHandle: 'value',
      },
    ],
    routine: {
      cadence: 'daily',
      inputContract: releaseLoopInputContract,
      kind: 'productized-daily-routine',
      outputDestinations: [
        {
          key: 'releaseAssets',
          label: 'Approved release asset pack',
          required: true,
          type: 'workflow_output',
        },
        {
          key: 'reviewTask',
          label: 'Release asset review task',
          required: true,
          type: 'task',
        },
        {
          key: 'socialPublish',
          label: 'Approved social publishing destination',
          required: false,
          type: 'social_publish',
        },
      ],
      parentIssue: 224,
      recommendedSkills: [
        'newsletter-creator',
        'x-content-creator',
        'linkedin-content-creator',
        'content-seo-optimizer',
      ],
      requiredSkills: [
        'content-strategist',
        'content-reviewer',
        'ad-copy-creator',
      ],
      reviewDefaults: DAILY_REVIEW_DEFAULTS,
      sourceIssue: 976,
      trackingTasks: [
        {
          description:
            'Review the daily release asset pack before it is distributed.',
          key: 'review-release-assets',
          outputType: 'post',
          priority: 'medium',
          reviewState: 'pending_approval',
          status: 'in_review',
          title: 'Review release assets',
        },
        {
          description:
            'Publish or schedule the approved release copy on the selected channel.',
          key: 'publish-approved-release',
          outputType: 'post',
          priority: 'medium',
          reviewState: 'pending_approval',
          status: 'todo',
          title: 'Publish approved release copy',
        },
      ],
      version: 1,
    },
    schedule: '0 9 * * *',
    steps: [
      {
        category: WorkflowStepCategory.GENERATE_ARTICLE,
        config: {
          model: 'openai/gpt-4o-mini',
          temperature: 0.7,
        },
        id: 'draft-release-assets',
        name: 'Draft Release Assets',
      },
      {
        category: WorkflowStepCategory.WEBHOOK,
        config: DAILY_REVIEW_DEFAULTS,
        dependsOn: ['draft-release-assets'],
        id: 'review-release-assets',
        name: 'Review Release Assets',
      },
    ],
    timezone: 'UTC',
  },
] satisfies ProductizedRoutineWorkflowTemplate[];
