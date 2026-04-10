'use client';

import type { ProcessNodeProps } from '@genfeedai/props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { memo } from 'react';
import {
  HiOutlineArrowsPointingOut,
  HiOutlineArrowsRightLeft,
  HiOutlineRectangleGroup,
  HiOutlineScissors,
  HiOutlineSquare2Stack,
} from 'react-icons/hi2';

const PROCESS_NODE_ICONS: Record<string, React.ReactNode> = {
  'process-clip': <HiOutlineScissors />,
  'process-merge': <HiOutlineRectangleGroup />,
  'process-resize': <HiOutlineArrowsRightLeft />,
  'process-split': <HiOutlineSquare2Stack />,
  'process-transform': <HiOutlineArrowsPointingOut />,
};

const DEFAULT_PROCESS_ICON = <HiOutlineArrowsPointingOut />;

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
