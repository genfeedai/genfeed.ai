'use client';

import type { OutputNodeProps } from '@genfeedai/props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { Download, Globe, Send, Upload } from 'lucide-react';
import { memo } from 'react';

function OutputNode(props: OutputNodeProps) {
  const getIcon = () => {
    switch (props.data.nodeType) {
      case 'output-save':
        return <Download />;
      case 'output-publish':
        return <Upload />;
      case 'output-webhook':
        return <Globe />;
      case 'output-notify':
        return <Send />;
      default:
        return <Download />;
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
