import { cn } from '@genfeedai/helpers';
import type { ReactElement } from 'react';

/** What the empty space fills with once there is data. */
export type EmptyStatePreviewShape = 'rows' | 'tiles';

export interface EmptyStatePreviewProps {
  shape: EmptyStatePreviewShape;
  /** Table column labels, drawn as the ghost header so the preview matches the real table. */
  columns?: string[];
  /** Layout classes only. */
  className?: string;
}

/** Cell bar widths, varied per row and column so the preview reads as real rows. */
const CELL_WIDTHS = [
  'w-3/4',
  'w-1/2',
  'w-2/5',
  'w-3/5',
  'w-1/3',
  'w-1/2',
  'w-3/5',
  'w-2/5',
];
const ROWS = ['a', 'b', 'c', 'd', 'e'];
const TILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function GhostRows({ columns }: { columns: string[] }): ReactElement {
  const template = {
    gridTemplateColumns: `1.6fr repeat(${Math.max(columns.length - 1, 1)}, 1fr)`,
  };

  return (
    <div data-slot="ghost-rows">
      <div
        className="grid gap-6 border-b border-border px-4 py-3"
        style={template}
      >
        {columns.map((label) => (
          <span
            className="text-2xs font-medium uppercase tracking-label text-muted-foreground/60"
            key={label}
          >
            {label}
          </span>
        ))}
      </div>
      {ROWS.map((row, rowIndex) => (
        <div
          className="grid items-center gap-6 border-b border-border/60 px-4 py-3.5 last:border-0"
          key={row}
          style={template}
        >
          {columns.map((label, column) => (
            <span
              className={cn(
                'h-2.5 rounded-full bg-muted-foreground/20',
                CELL_WIDTHS[(column + rowIndex * 3) % CELL_WIDTHS.length],
              )}
              key={label}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function GhostTiles(): ReactElement {
  return (
    <div
      className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4"
      data-slot="ghost-tiles"
    >
      {TILES.map((tile) => (
        <div className="space-y-2" key={tile}>
          <div className="aspect-[4/3] rounded-lg bg-muted-foreground/10" />
          <div className="h-2.5 w-2/3 rounded-full bg-muted-foreground/20" />
        </div>
      ))}
    </div>
  );
}

/**
 * A faded preview of what will fill an empty table or grid. Decorative only:
 * hidden from assistive tech, never carries real data, and fades out toward
 * the bottom so the space never reads as a broken table.
 */
export function EmptyStatePreview({
  shape,
  columns = [],
  className,
}: EmptyStatePreviewProps): ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'select-none [mask-image:linear-gradient(to_bottom,black_0%,black_30%,transparent_95%)]',
        className,
      )}
      data-slot="empty-state-preview"
    >
      {shape === 'rows' ? <GhostRows columns={columns} /> : <GhostTiles />}
    </div>
  );
}
