'use client';

import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { BaseNode } from '../BaseNode';

interface WorkflowSaaSHandleDefinition {
  id: string;
  label: string;
  multiple?: boolean;
  optional?: boolean;
  required?: boolean;
  type: string;
}

interface WorkflowSaaSNodeDefinition {
  category: string;
  icon: string;
  inputs: WorkflowSaaSHandleDefinition[];
  label: string;
  outputs: WorkflowSaaSHandleDefinition[];
}

export const workflowSaaSNodeDefinitions = {
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
} as const satisfies Record<string, WorkflowSaaSNodeDefinition>;

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
) as Record<WorkflowSaaSNodeType, typeof SaaSNode>;
