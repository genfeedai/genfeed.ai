'use client';

import { type ReactElement, useCallback, useRef } from 'react';

interface AgentResizeHandleProps {
  onResize: (deltaX: number) => void;
  onResizeEnd: () => void;
  onResetWidth?: () => void;
}

export function AgentResizeHandle({
  onResize,
  onResizeEnd,
  onResetWidth,
}: AgentResizeHandleProps): ReactElement {
  const startXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      function onMouseMove(moveEvent: MouseEvent) {
        const deltaX = startXRef.current - moveEvent.clientX;
        startXRef.current = moveEvent.clientX;
        onResize(deltaX);
      }

      function onMouseUp() {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        onResizeEnd();
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onResize, onResizeEnd],
  );

  const handleDoubleClick = useCallback(() => {
    onResetWidth?.();
  }, [onResetWidth]);

  return (
    <div
      role="slider"
      aria-label="Resize agent panel"
      aria-valuemin={280}
      aria-valuemax={500}
      aria-valuenow={380}
      tabIndex={0}
      className="absolute left-0 top-0 z-30 h-full w-1.5 cursor-col-resize group outline-none"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="absolute left-0.5 top-0 h-full w-0.5 bg-transparent transition-colors group-hover:bg-primary/40" />
    </div>
  );
}
