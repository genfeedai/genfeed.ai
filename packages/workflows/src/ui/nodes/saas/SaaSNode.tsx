'use client';

import type { VisualNodeDefinition } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { BaseNode } from '../BaseNode';
import { GenfeedActionNode } from './GenfeedActionNode';

export const workflowSaaSNodeDefinitions = {
  genfeedAction: {
    category: 'automation',
    icon: 'Workflow',
    inputs: [
      { id: 'input', label: 'Action Input', optional: true, type: 'any' },
    ],
    label: 'Genfeed Action',
    outputs: [{ id: 'output', label: 'Action Output', type: 'any' }],
  },
  talkingHeadScript: {
    category: 'ai',
    icon: 'FileText',
    inputs: [
      {
        id: 'productContext',
        label: 'Product Context',
        optional: false,
        type: 'text',
      },
      {
        id: 'brandVoice',
        label: 'Brand Voice',
        optional: true,
        type: 'text',
      },
      {
        id: 'harnessContext',
        label: 'Harness Context',
        optional: true,
        type: 'object',
      },
      {
        id: 'durationSeconds',
        label: 'Duration (seconds)',
        optional: true,
        type: 'number',
      },
      {
        id: 'clipCount',
        label: 'Clip Count',
        optional: true,
        type: 'number',
      },
      {
        id: 'wordsPerSecond',
        label: 'Words per Second',
        optional: true,
        type: 'number',
      },
      {
        id: 'language',
        label: 'Language',
        optional: true,
        type: 'text',
      },
    ],
    label: 'Talking-head Script',
    outputs: [
      { id: 'script', label: 'Timed Script', type: 'object' },
      { id: 'segments', label: 'Segments', type: 'object' },
      { id: 'fullText', label: 'Full Script', type: 'text' },
      { id: 'clipCount', label: 'Clip Count', type: 'number' },
      {
        id: 'totalDurationSeconds',
        label: 'Total Duration (seconds)',
        type: 'number',
      },
      {
        id: 'totalTargetWordCount',
        label: 'Target Words',
        type: 'number',
      },
      { id: 'totalWordCount', label: 'Actual Words', type: 'number' },
      {
        id: 'wordsPerSecond',
        label: 'Words per Second',
        type: 'number',
      },
    ],
  },
  trendHashtagInspiration: {
    category: 'ai',
    icon: 'Hash',
    inputs: [{ id: 'hashtag', label: 'Hashtag', optional: true, type: 'text' }],
    label: 'Trend Hashtag Inspiration',
    outputs: [
      { id: 'prompt', label: 'Prompt', type: 'text' },
      { id: 'hashtags', label: 'Hashtags', type: 'text[]' },
      { id: 'contentType', label: 'Content Type', type: 'text' },
      { id: 'platform', label: 'Best Platform', type: 'text' },
    ],
  },
  trendSoundInspiration: {
    category: 'ai',
    icon: 'Music',
    inputs: [],
    label: 'Trend Sound Inspiration',
    outputs: [
      { id: 'soundId', label: 'Sound ID', type: 'text' },
      { id: 'soundName', label: 'Sound Name', type: 'text' },
      { id: 'soundUrl', label: 'Sound URL', type: 'text' },
      { id: 'duration', label: 'Duration (s)', type: 'number' },
      { id: 'usageCount', label: 'Usage Count', type: 'number' },
    ],
  },
  trendVideoInspiration: {
    category: 'ai',
    icon: 'Sparkles',
    inputs: [
      { id: 'trendId', label: 'Trend ID', optional: true, type: 'text' },
    ],
    label: 'Trend Video Inspiration',
    outputs: [
      { id: 'prompt', label: 'Prompt', type: 'text' },
      { id: 'hashtags', label: 'Hashtags', type: 'text[]' },
      { id: 'soundId', label: 'Sound ID', type: 'text' },
      { id: 'duration', label: 'Duration (s)', type: 'number' },
      { id: 'aspectRatio', label: 'Aspect Ratio', type: 'text' },
      { id: 'style', label: 'Style', type: 'text' },
    ],
  },
} as const satisfies Record<string, VisualNodeDefinition>;

export type WorkflowSaaSNodeType = keyof typeof workflowSaaSNodeDefinitions;

function SaaSNodeComponent(props: NodeProps) {
  const definition =
    workflowSaaSNodeDefinitions[props.type as WorkflowSaaSNodeType];

  return <BaseNode {...props} nodeDefinition={definition} />;
}

export const SaaSNode = memo(SaaSNodeComponent);

export const workflowSaaSNodeTypes = Object.fromEntries(
  Object.keys(workflowSaaSNodeDefinitions).map((nodeType) => [
    nodeType,
    SaaSNode,
  ]),
) as Record<WorkflowSaaSNodeType, typeof SaaSNode | typeof GenfeedActionNode>;

workflowSaaSNodeTypes.genfeedAction = GenfeedActionNode;
