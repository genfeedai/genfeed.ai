'use client';

import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from '@ui/primitives/animated-icons/animated-icon.types';
import { useAnimation } from 'motion/react';
import type { ForwardedRef, MouseEvent } from 'react';
import { useCallback, useImperativeHandle, useRef } from 'react';

export function useAnimatedIconControls(
  ref: ForwardedRef<AnimatedIconHandle>,
  {
    onMouseEnter,
    onMouseLeave,
  }: Pick<AnimatedIconProps, 'onMouseEnter' | 'onMouseLeave'>,
) {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;
    return {
      startAnimation: () => controls.start('animate'),
      stopAnimation: () => controls.start('normal'),
    };
  });

  const handleMouseEnter = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseEnter?.(event);
      } else {
        controls.start('animate');
      }
    },
    [controls, onMouseEnter],
  );

  const handleMouseLeave = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseLeave?.(event);
      } else {
        controls.start('normal');
      }
    },
    [controls, onMouseLeave],
  );

  return { controls, handleMouseEnter, handleMouseLeave };
}
