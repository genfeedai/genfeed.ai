'use client';

import type { VisualNodeDefinition } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import {
  ACTION_NODE_DEFINITIONS,
  type CatalogNodeDefinition,
  ENGINE_NATIVE_NODE_DEFINITIONS,
} from '../../../nodes/registry';
import { BaseNode } from '../BaseNode';
import { GenfeedActionNode } from './GenfeedActionNode';

function toVisualNodeDefinition(
  definition: CatalogNodeDefinition,
): VisualNodeDefinition {
  return {
    category: definition.category,
    icon: definition.icon,
    inputs: definition.inputs.map((input) => ({
      id: input.id,
      label: input.label,
      optional: input.required !== true,
      type: input.type,
    })),
    label: definition.label,
    outputs: definition.outputs.map((output) => ({
      id: output.id,
      label: output.label,
      type: output.type,
    })),
  };
}

export const workflowSaaSNodeDefinitions = {
  genfeedAction: toVisualNodeDefinition(
    ENGINE_NATIVE_NODE_DEFINITIONS.genfeedAction,
  ),
  ...Object.fromEntries(
    Object.entries(ACTION_NODE_DEFINITIONS).map(([type, definition]) => [
      type,
      toVisualNodeDefinition(definition),
    ]),
  ),
} satisfies Record<string, VisualNodeDefinition>;

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
