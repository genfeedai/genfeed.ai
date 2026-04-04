'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

interface PanelContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Wrapper for side panels that isolates them from React Flow canvas events.
 * Prevents clicks, drags, and pointer events from bubbling to the canvas.
 *
 * Use this for any panel rendered alongside the WorkflowCanvas to prevent
 * double-click issues and event interference.
 */
export const PanelContainer = forwardRef<HTMLDivElement, PanelContainerProps>(
  ({ children, className, ...props }, ref) => {
    const stopPropagation = (e: React.SyntheticEvent) => {
      e.stopPropagation();
    };

    return (
      <div
        ref={ref}
        className={className}
        onClick={stopPropagation}
        onMouseDown={stopPropagation}
        onPointerDown={stopPropagation}
        onDoubleClick={stopPropagation}
        {...props}
      >
        {children}
      </div>
    );
  }
);

PanelContainer.displayName = 'PanelContainer';
