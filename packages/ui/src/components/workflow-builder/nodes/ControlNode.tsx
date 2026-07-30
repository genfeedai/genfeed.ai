'use client';

import type { ControlNodeProps } from '@genfeedai/props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { Clock, Maximize2, RefreshCw } from 'lucide-react';
import { memo } from 'react';

const CONTROL_NODE_ICONS: Record<string, React.ReactNode> = {
  'control-branch': <Maximize2 />,
  'control-delay': <Clock />,
  'control-loop': <RefreshCw />,
};

const DEFAULT_CONTROL_ICON = <Clock />;

function ControlNode(props: ControlNodeProps): React.ReactElement {
  const icon = CONTROL_NODE_ICONS[props.data.nodeType] ?? DEFAULT_CONTROL_ICON;

  return (
    <BaseNode
      {...props}
      bgColor="bg-secondary"
      borderColor="border-muted-foreground"
      icon={icon}
    />
  );
}

export default memo(ControlNode);
