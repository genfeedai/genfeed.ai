'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  ThreadListRecencySectionsProps,
  ThreadListRowProps,
  ThreadListSectionProps,
  ThreadListStatus,
} from '@genfeedai/props/ui/lists/thread-list.props';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import { Button } from '@ui/primitives/button';
import { ChevronDown, Circle, CircleAlert, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Fragment,
  type ReactElement,
  type ReactNode,
  useId,
  useState,
} from 'react';
import { groupThreadsByRecency } from './group-by-recency';

const STATUS_ICONS: Record<ThreadListStatus, ReactElement> = {
  attention: <CircleAlert className="size-4 text-warning" />,
  done: <CircleCheck className="size-4 text-success" />,
  idle: <Circle className="size-4 text-muted-foreground" />,
};

/**
 * One group of a flat thread list: a quiet header with the count, then plain
 * rows. The header folds the group away, and folded rows stay out of the
 * accessibility tree. A group with nothing in it renders nothing.
 */
export function ThreadListSection({
  children,
  isDefaultCollapsed = false,
  itemCount,
  title,
  'data-testid': dataTestId,
}: ThreadListSectionProps): ReactElement | null {
  const listId = useId();
  const [isOpen, setIsOpen] = useState(!isDefaultCollapsed);

  if (itemCount === 0) {
    return null;
  }

  return (
    <section className="flex flex-col" data-testid={dataTestId}>
      <h3 className="m-0 text-xs font-normal">
        <Button
          aria-controls={listId}
          aria-expanded={isOpen}
          className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setIsOpen((current) => !current)}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <span>{title}</span>
          <span className="tabular-nums text-muted-foreground/70">
            · {itemCount}
          </span>
          <ChevronDown
            className={cn(
              'size-3 transition-transform motion-reduce:transition-none',
              !isOpen && '-rotate-90',
            )}
          />
        </Button>
      </h3>
      <ul
        className={cn('flex flex-col', !isOpen && 'hidden')}
        hidden={!isOpen}
        id={listId}
      >
        {children}
      </ul>
    </section>
  );
}

/**
 * The single quiet line under a thread's title: parts joined by a centred dot.
 * Each part stays its own element so it can be read and matched on its own.
 */
export function ThreadListSubtitle({
  parts,
}: {
  parts: readonly ReactNode[];
}): ReactElement {
  const visible = parts.filter(
    (part) => part !== null && part !== undefined && part !== '',
  );

  return (
    <>
      {visible.map((part, index) => (
        // The parts are fixed per row, so their position is a stable key.
        // biome-ignore lint/suspicious/noArrayIndexKey: ordered, never reordered
        <Fragment key={index}>
          {index > 0 ? <span aria-hidden="true"> · </span> : null}
          <span>{part}</span>
        </Fragment>
      ))}
    </>
  );
}

/**
 * One thread: status icon, title, a single quiet subtitle and the date on the
 * right. No border or fill until hover. On hover or keyboard focus the date
 * gives way to the ⋯ menu. The menu sits beside the link, not inside it, so
 * the row stays valid markup and a click on the menu never opens the thread.
 */
export function ThreadListRow({
  actions,
  actionsLabel,
  'data-testid': dataTestId,
  href,
  leading,
  status = 'idle',
  statusLabel,
  subtitle,
  time,
  title,
}: ThreadListRowProps): ReactElement {
  const hasActions = actions !== undefined && actions.length > 0;

  return (
    <li
      className="group relative rounded-lg transition-colors focus-within:bg-hover hover:bg-hover"
      data-testid={dataTestId}
    >
      <Link
        className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={href}
      >
        {leading ?? (
          <span
            className="mt-0.5 shrink-0"
            {...(statusLabel
              ? { 'aria-label': statusLabel, role: 'img' }
              : { 'aria-hidden': true })}
          >
            {STATUS_ICONS[status]}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-foreground">{title}</span>
          {subtitle ? (
            <span className="truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </span>
        {time ? (
          <span
            className={cn(
              'mt-0.5 shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground',
              hasActions &&
                'group-focus-within:opacity-0 group-hover:opacity-0',
            )}
          >
            {time}
          </span>
        ) : null}
      </Link>
      {hasActions ? (
        <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100">
          <CollectionItemActions
            overflow={actions}
            overflowLabel={actionsLabel}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Rows grouped under Today, Previous 7 days and Earlier, newest group first.
 * The caller passes items already sorted; the groups only split them.
 */
export function ThreadListRecencySections<TItem>({
  getDate,
  getKey,
  items,
  renderRow,
}: ThreadListRecencySectionsProps<TItem>): ReactElement {
  const translate = useTranslations('ui.threadList');

  return (
    <>
      {groupThreadsByRecency(items, getDate).map((bucket) => (
        <ThreadListSection
          itemCount={bucket.items.length}
          key={bucket.group}
          title={translate(bucket.group)}
        >
          {bucket.items.map((item) => (
            <Fragment key={getKey(item)}>{renderRow(item)}</Fragment>
          ))}
        </ThreadListSection>
      ))}
    </>
  );
}
