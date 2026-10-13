import type {
  ComponentType,
  FocusEventHandler,
  HTMLAttributes,
  MouseEventHandler,
  ReactNode,
  Ref,
} from 'react';

/** What every lucide-animated icon exposes so a parent can drive it. */
export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export interface AnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

export type AnimatedIconComponent = ComponentType<
  AnimatedIconProps & { ref?: Ref<AnimatedIconHandle> }
>;

export interface AnimatedIconHoverProps {
  onBlur: FocusEventHandler<HTMLElement>;
  onFocus: FocusEventHandler<HTMLElement>;
  onMouseEnter: MouseEventHandler<HTMLElement>;
  onMouseLeave: MouseEventHandler<HTMLElement>;
}

export interface UseHoverAnimatedIconOptions {
  /** Size class the static icon is given by its host when it sets none. */
  defaultSizeClassName?: string;
}

/** The icon to render plus the handlers the interactive host must carry. */
export interface HoverAnimatedIcon {
  hoverProps: AnimatedIconHoverProps;
  icon: ReactNode;
  /** True when the icon has an animated twin and motion is allowed to run. */
  isAnimatable: boolean;
  start: () => void;
  stop: () => void;
}
