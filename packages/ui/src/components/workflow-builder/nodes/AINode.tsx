'use client';

import type { AINodeProps } from '@genfeedai/props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { Box, FileText, Image, Sparkles, Video } from 'lucide-react';
import { memo } from 'react';

function AINode(props: AINodeProps) {
  const getIcon = () => {
    switch (props.data.nodeType) {
      case 'ai-generate-image':
        return <Image />;
      case 'ai-generate-video':
        return <Video />;
      case 'ai-generate-text':
        return <FileText />;
      case 'ai-enhance':
        return <Sparkles />;
      case 'ai-upscale':
        return <Box />;
      default:
        return <Sparkles />;
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
