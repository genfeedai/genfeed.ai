'use client';

import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from '@ui/primitives/animated-icons/animated-icon.types';
import { useAnimation } from 'motion/react';
import type { ForwardedRef, MouseEvent } from 'react';
import { useCallback, useImperativeHandle, useRef } from 'react';

type AnimationControls = ReturnType<typeof useAnimation>;

/**
 * How an icon plays and resets; the default runs its `animate` / `normal`
 * variants. Define it at module scope so the hover handlers stay stable.
 */
export interface AnimatedIconSequence {
  start?: (controls: AnimationControls) => unknown;
  stop?: (controls: AnimationControls) => unknown;
}

const playAnimate = (controls: AnimationControls) => controls.start('animate');
const playNormal = (controls: AnimationControls) => controls.start('normal');

/**
 * The shared controller contract for a registry icon: a parent holding the ref
 * drives it (`startAnimation` / `stopAnimation`) and receives hover; without a
 * ref the icon animates on its own hover and the host's handlers stay silent.
 */
export function useAnimatedIconControls(
  ref: ForwardedRef<AnimatedIconHandle>,
  {
    onMouseEnter,
    onMouseLeave,
  }: Pick<AnimatedIconProps, 'onMouseEnter' | 'onMouseLeave'>,
  { start = playAnimate, stop = playNormal }: AnimatedIconSequence = {},
) {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;
    return {
      startAnimation: () => start(controls),
      stopAnimation: () => stop(controls),
    };
  });

  const handleMouseEnter = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseEnter?.(event);
      } else {
        void start(controls);
      }
    },
    [controls, onMouseEnter, start],
  );

  const handleMouseLeave = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseLeave?.(event);
      } else {
        void stop(controls);
      }
    },
    [controls, onMouseLeave, stop],
  );

  return { controls, handleMouseEnter, handleMouseLeave };
}
