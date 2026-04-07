'use client';

import type { EffectsNodeProps } from '@props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import { memo } from 'react';
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineChatBubbleBottomCenter,
  HiOutlineEyeDropper,
  HiOutlineMusicalNote,
  HiOutlineSparkles,
  HiOutlineSpeakerWave,
} from 'react-icons/hi2';

function EffectsNode(props: EffectsNodeProps) {
  const getIcon = () => {
    switch (props.data.nodeType) {
      case 'effect-captions':
        return <HiOutlineChatBubbleBottomCenter />;
      case 'effect-ken-burns':
        return <HiOutlineSparkles />;
      case 'effect-color-grade':
        return <HiOutlineEyeDropper />;
      case 'effect-overlay':
        return <HiOutlineAdjustmentsHorizontal />;
      case 'effect-audio':
        return <HiOutlineSpeakerWave />;
      case 'effect-music':
        return <HiOutlineMusicalNote />;
      default:
        return <HiOutlineSparkles />;
    }
  };

  return (
    <BaseNode
      {...props}
      bgColor="bg-purple-50"
      borderColor="border-purple-400"
      icon={getIcon()}
    />
  );
}

export default memo(EffectsNode);
