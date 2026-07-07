'use client';

import type { MasonryProps } from '@genfeedai/props/content/masonry.props';
import { Children, isValidElement, useEffect, useMemo, useRef } from 'react';
import { useMounted } from '../../../lib/hooks';

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
  const mounted = useMounted();

  const childArray = useMemo(
    () => Children.toArray(children).filter(Boolean),
    [children],
  );

  useEffect(() => {
    if (!mounted || !containerRef.current) {
      return;
    }

    Object.assign(containerRef.current.style, {
      display: 'grid',
      gap: `${gap}px`,
    });

    const updateColumns = (): void => {
      if (!containerRef.current) {
        return;
      }

      const width = window.innerWidth;
      const breakpoint = BREAKPOINTS.find(
        (bp) => columns[bp.key] !== undefined && width >= bp.width,
      );
      const cols = breakpoint ? columns[breakpoint.key] : columns.default;

      containerRef.current.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    };

    updateColumns();

    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [mounted, columns, gap]);

  // Server render as flex, client renders as grid
  return (
    <div
      ref={containerRef}
      className={`flex flex-wrap ${className}`}
      style={!mounted ? { gap: `${gap}px` } : undefined}
    >
      {childArray.map((child) => {
        const childKey =
          isValidElement(child) && child.key !== null
            ? child.key
            : String(child);

        return (
          <div
            key={childKey}
            className={!mounted ? 'flex-1' : 'w-full'}
            style={!mounted ? { minWidth: '200px' } : undefined}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
