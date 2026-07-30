'use client';

import type { EffectsNodeProps } from '@genfeedai/props/automation/workflow-builder.props';
import BaseNode from '@ui/workflow-builder/nodes/BaseNode';
import {
  MessageSquare,
  Music,
  Pipette,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { memo } from 'react';

function EffectsNode(props: EffectsNodeProps) {
  const getIcon = () => {
    switch (props.data.nodeType) {
      case 'effect-captions':
        return <MessageSquare />;
      case 'effect-ken-burns':
        return <Sparkles />;
      case 'effect-color-grade':
        return <Pipette />;
      case 'effect-overlay':
        return <SlidersHorizontal />;
      case 'effect-audio':
        return <Volume2 />;
      case 'effect-music':
        return <Music />;
      default:
        return <Sparkles />;
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
