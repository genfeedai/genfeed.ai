'use client';

import type { AINodeProps } from '@props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { memo } from 'react';
import {
  HiOutlineCube,
  HiOutlineDocumentText,
  HiOutlinePhoto,
  HiOutlineSparkles,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';

function AINode(props: AINodeProps) {
  const getIcon = () => {
    switch (props.data.nodeType) {
      case 'ai-generate-image':
        return <HiOutlinePhoto />;
      case 'ai-generate-video':
        return <HiOutlineVideoCamera />;
      case 'ai-generate-text':
        return <HiOutlineDocumentText />;
      case 'ai-enhance':
        return <HiOutlineSparkles />;
      case 'ai-upscale':
        return <HiOutlineCube />;
      default:
        return <HiOutlineSparkles />;
    }
  };

  return (
    <BaseNode
      {...props}
      bgColor="bg-amber-50"
      borderColor="border-amber-400"
      icon={getIcon()}
    />
  );
}

export default memo(AINode);
