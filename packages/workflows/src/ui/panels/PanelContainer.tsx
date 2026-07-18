'use client';

import type { HTMLAttributes, ReactNode, Ref, SyntheticEvent } from 'react';

interface PanelContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Wrapper for side panels that isolates them from React Flow canvas events.
 * Prevents clicks, drags, and pointer events from bubbling to the canvas.
 *
 * Use this for any panel rendered alongside the WorkflowCanvas to prevent
 * double-click issues and event interference.
 */
export function PanelContainer({
  children,
  className,
  ref,
  ...props
}: PanelContainerProps) {
  const stopPropagation = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={ref}
      className={className}
      role="presentation"
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
      onDoubleClick={stopPropagation}
      {...props}
    >
      {children}
    </div>
  );
}
