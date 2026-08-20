'use client';

import type { MasonryProps } from '@genfeedai/props/content/masonry.props';
import { Children, isValidElement, useEffect, useMemo, useRef } from 'react';

const BREAKPOINTS = [
  { key: 'xl' as const, width: 1280 },
  { key: 'lg' as const, width: 1024 },
  { key: 'md' as const, width: 768 },
  { key: 'sm' as const, width: 640 },
];

export default function Masonry({
  children,
  columns = { default: 1, lg: 4, md: 3, sm: 2 },
  gap = 4,
  className = '',
}: MasonryProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  const childArray = useMemo(
    () => Children.toArray(children).filter(Boolean),
    [children],
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const updateColumns = (): void => {
      if (!containerRef.current) {
        return;
      }

      const width = window.innerWidth;
      const breakpoint = BREAKPOINTS.find(
        (bp) => columns[bp.key] !== undefined && width >= bp.width,
      );
      const cols = breakpoint ? columns[breakpoint.key] : columns.default;

      containerRef.current.style.columnCount = String(cols);
    };

    updateColumns();

    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [columns]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ columnCount: columns.default, columnGap: `${gap}px` }}
    >
      {childArray.map((child) => {
        const childKey =
          isValidElement(child) && child.key !== null
            ? child.key
            : String(child);

        return (
          <div
            key={childKey}
            className="w-full break-inside-avoid"
            style={{ marginBottom: `${gap}px` }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
