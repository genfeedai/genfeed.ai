'use client';

import type { HTMLAttributes, ReactNode, Ref, SyntheticEvent } from 'react';

export interface FlowPanelContainerProps
  extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

export function FlowPanelContainer({
  children,
  className,
  ref,
  ...props
}: FlowPanelContainerProps) {
  const stopPropagation = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      ref={ref}
      className={className}
      onMouseDownCapture={stopPropagation}
      onPointerDownCapture={stopPropagation}
      onDoubleClickCapture={stopPropagation}
      {...props}
    >
      {children}
    </div>
  );
}

FlowPanelContainer.displayName = 'FlowPanelContainer';
