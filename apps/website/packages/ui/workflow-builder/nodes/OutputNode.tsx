'use client';

import type { OutputNodeProps } from '@props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { memo } from 'react';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowUpTray,
  HiOutlineGlobeAlt,
  HiOutlinePaperAirplane,
} from 'react-icons/hi2';

function OutputNode(props: OutputNodeProps) {
  const getIcon = () => {
    switch (props.data.nodeType) {
      case 'output-save':
        return <HiOutlineArrowDownTray />;
      case 'output-publish':
        return <HiOutlineArrowUpTray />;
      case 'output-webhook':
        return <HiOutlineGlobeAlt />;
      case 'output-notify':
        return <HiOutlinePaperAirplane />;
      default:
        return <HiOutlineArrowDownTray />;
    }
  };

  return (
    <BaseNode
      {...props}
      bgColor="bg-red-50"
      borderColor="border-red-400"
      icon={getIcon()}
    />
  );
}

export default memo(OutputNode);
