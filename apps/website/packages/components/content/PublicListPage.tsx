import { cn } from '@helpers/formatting/cn/cn.util';
import type { PublicListPageProps } from '@props/website/public-list-page.props';
import CardIcon from '@ui/card/icon/CardIcon';
import Pagination from '@ui/navigation/pagination/Pagination';

/**
 * The frame for a server-rendered public list (articles, posts).
 *
 * These pages used the app's `Container`, a client component built for the
 * workspace: section topbar, Radix tabs, help popover, and page contexts. None
 * of it shows on the website, and it put ~30 KB gzip on each list's first
 * load. This renders the same padding and title on the server, and page links
 * the list fetched with its data instead of a client pagination that never
 * learned the totals.
 */
export default function PublicListPage({
  children,
  className,
  description,
  icon,
  isLabelHidden = false,
  label,
  pagination,
  totalLabel,
}: PublicListPageProps) {
  const heading =
    label && !isLabelHidden ? (
      <div className="mb-4 flex items-center gap-2 px-5 pb-3 sm:px-6">
        {icon ? (
          <CardIcon
            icon={icon}
            className="text-foreground/60"
            iconClassName="size-3.5"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-[-0.01em] text-foreground">
            {label}
          </h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-xs leading-snug text-foreground/55">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    ) : label ? (
      <h1 className="sr-only">{label}</h1>
    ) : null;

  return (
    <div className={cn('w-full py-5 sm:py-6', className)}>
      {heading}
      <div className="px-5 sm:px-6">
        {children}
        {/* Keyed on the API's total, not this page's items: a page past the
            end is empty but still needs links back. */}
        {pagination && pagination.total > 0 ? (
          <div className="mt-8">
            <Pagination
              currentPage={pagination.page}
              totalItems={pagination.total}
              totalLabel={totalLabel}
              totalPages={pagination.totalPages}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
