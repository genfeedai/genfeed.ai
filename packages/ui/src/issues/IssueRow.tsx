import type { ComponentType, ReactNode } from 'react';
import { StatusIcon } from './StatusIcon';

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

interface IssueRowProps {
  /** Issue/task identifier (e.g., "GEN-42") */
  identifier: string;
  /** Issue title */
  title: string;
  /** Status key (e.g., "in_progress", "done") */
  status: string;
  /** Link destination */
  href: string;
  /** Whether this row is selected/active */
  selected?: boolean;
  /** Trailing metadata (e.g., assignee avatars, date, input preview) */
  trailing?: ReactNode;
  /** Additional trailing text (e.g., relative time) */
  trailingMeta?: ReactNode;
  className?: string;
  linkComponent?: ComponentType<{
    href: string;
    className: string;
    children: ReactNode;
  }>;
}

export function IssueRow({
  identifier,
  title,
  status,
  href,
  selected = false,
  trailing,
  trailingMeta,
  className,
  linkComponent: LinkComponent,
}: IssueRowProps) {
  const classes = cn(
    'group flex items-center gap-2 border-b border-border py-2.5 px-3 text-sm no-underline text-inherit transition-colors last:border-b-0',
    selected ? 'hover:bg-transparent' : 'hover:bg-accent/50',
    className,
  );

  const content = (
    <>
      {/* Column 1: Status dot */}
      <span className="shrink-0">
        <StatusIcon status={status} />
      </span>

      {/* Column 2: Identifier + Title */}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {identifier}
        </span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </span>

      {/* Column 3: Trailing metadata */}
      {(trailing || trailingMeta) && (
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {trailing}
          {trailingMeta && (
            <span className="text-xs text-muted-foreground">
              {trailingMeta}
            </span>
          )}
        </span>
      )}
    </>
  );

  if (LinkComponent) {
    return (
      <LinkComponent href={href} className={classes}>
        {content}
      </LinkComponent>
    );
  }

  return (
    <a href={href} className={classes}>
      {content}
    </a>
  );
}
