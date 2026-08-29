'use client';

import { getNodeDefinition } from '@genfeedai/workflows/nodes';
import { BaseNode } from '@genfeedai/workflows/ui/nodes';
import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';

function RegisteredWorkflowNodeComponent(props: NodeProps): React.JSX.Element {
  const definition = getNodeDefinition(props.type);
  if (!definition) {
    throw new Error(`Missing workflow node definition for ${props.type}`);
  }
  return <BaseNode {...props} nodeDefinition={definition} />;
}

export const RegisteredWorkflowNode = memo(RegisteredWorkflowNodeComponent);
