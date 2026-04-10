'use client';

import type { ControlNodeProps } from '@genfeedai/props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { memo } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineArrowsPointingOut,
  HiOutlineClock,
} from 'react-icons/hi2';

const CONTROL_NODE_ICONS: Record<string, React.ReactNode> = {
  'control-branch': <HiOutlineArrowsPointingOut />,
  'control-delay': <HiOutlineClock />,
  'control-loop': <HiOutlineArrowPath />,
};

const DEFAULT_CONTROL_ICON = <HiOutlineClock />;

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
