import type { ReactElement, ReactNode } from 'react';

/**
 * Plain section heading for a group of table rows. Return it as the `content`
 * of `Table`'s `getGroupHeading` so every grouped table labels its sections
 * the same way.
 */
export default function TableGroupHeading({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <h3 className="m-0 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
      {children}
    </h3>
  );
}
