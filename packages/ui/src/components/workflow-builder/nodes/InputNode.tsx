'use client';

import type { InputNodeProps } from '@genfeedai/props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { FileText, FolderOpen, Image, Video } from 'lucide-react';
import { memo } from 'react';

const INPUT_NODE_ICONS: Record<string, React.ReactNode> = {
  'input-asset': <FolderOpen />,
  'input-image': <Image />,
  'input-prompt': <FileText />,
  'input-template': <FileText />,
  'input-video': <Video />,
};

const DEFAULT_INPUT_ICON = <Image />;

function InputNode(props: InputNodeProps): React.ReactElement {
  const icon = INPUT_NODE_ICONS[props.data.nodeType] ?? DEFAULT_INPUT_ICON;

  return (
    <BaseNode
      {...props}
      bgColor="bg-green-50"
      borderColor="border-green-400"
      icon={icon}
    />
  );
}

export default memo(InputNode);
