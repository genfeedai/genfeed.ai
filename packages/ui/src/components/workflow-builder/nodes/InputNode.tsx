'use client';

import type { InputNodeProps } from '@props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { memo } from 'react';
import {
  HiOutlineDocumentText,
  HiOutlineFolderOpen,
  HiOutlinePhoto,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';

const INPUT_NODE_ICONS: Record<string, React.ReactNode> = {
  'input-asset': <HiOutlineFolderOpen />,
  'input-image': <HiOutlinePhoto />,
  'input-prompt': <HiOutlineDocumentText />,
  'input-template': <HiOutlineDocumentText />,
  'input-video': <HiOutlineVideoCamera />,
};

const DEFAULT_INPUT_ICON = <HiOutlinePhoto />;

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
