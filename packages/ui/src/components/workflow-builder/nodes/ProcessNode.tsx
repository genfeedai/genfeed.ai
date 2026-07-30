'use client';

import type { ProcessNodeProps } from '@genfeedai/props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import {
  ArrowLeftRight,
  Copy,
  LayoutDashboard,
  Maximize2,
  Scissors,
} from 'lucide-react';
import { memo } from 'react';

const PROCESS_NODE_ICONS: Record<string, React.ReactNode> = {
  'process-clip': <Scissors />,
  'process-merge': <LayoutDashboard />,
  'process-resize': <ArrowLeftRight />,
  'process-split': <Copy />,
  'process-transform': <Maximize2 />,
};

const DEFAULT_PROCESS_ICON = <Maximize2 />;

function ProcessNode(props: ProcessNodeProps): React.ReactElement {
  const icon = PROCESS_NODE_ICONS[props.data.nodeType] ?? DEFAULT_PROCESS_ICON;

  return (
    <BaseNode
      {...props}
      bgColor="bg-blue-50"
      borderColor="border-blue-400"
      icon={icon}
    />
  );
}

export default memo(ProcessNode);
