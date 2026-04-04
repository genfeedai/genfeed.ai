import type { DragEvent, ReactNode } from 'react';
import { useCallback, useState } from 'react';

interface DropZoneProps {
  children: ReactNode;
  className?: string;
  onFilesDropped: (paths: string[]) => void;
}

export const DropZone = ({
  children,
  className,
  onFilesDropped,
}: DropZoneProps) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const paths = files
        .map((file) => (file as File & { path?: string }).path)
        .filter((p): p is string => Boolean(p));

      if (paths.length > 0) {
        onFilesDropped(paths);
      }
    },
    [onFilesDropped],
  );

  return (
    <div
      className={`drop-zone ${isDragOver ? 'drop-zone-active' : ''} ${className ?? ''}`}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragOver && (
        <div className="drop-zone-overlay">
          <div className="drop-zone-overlay-content">
            <span className="drop-zone-icon">+</span>
            <span className="drop-zone-label">Drop files here</span>
          </div>
        </div>
      )}
    </div>
  );
};
