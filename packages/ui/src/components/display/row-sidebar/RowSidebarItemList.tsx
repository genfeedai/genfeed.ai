import type { RowSidebarItemListProps } from '@genfeedai/props/ui/display/row-sidebar-blocks.props';
import { Skeleton } from '@ui/primitives/skeleton';
import Link from 'next/link';

/** Short list of related records (e.g. top posts) for a row's sidebar. */
export default function RowSidebarItemList({
  emptyLabel,
  isLoading = false,
  items,
}: RowSidebarItemListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => {
        const content = (
          <>
            {item.icon}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{item.title}</span>
              {item.meta ? (
                <span className="truncate text-xs text-muted-foreground">
                  {item.meta}
                </span>
              ) : null}
            </span>
          </>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <Link
                className="flex items-center gap-2 py-2 hover:underline"
                href={item.href}
              >
                {content}
              </Link>
            ) : (
              <div className="flex items-center gap-2 py-2">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
