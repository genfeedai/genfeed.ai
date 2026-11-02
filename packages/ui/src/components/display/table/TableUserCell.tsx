import type { TableUserCellProps } from '@genfeedai/props/ui/display/table-user-cell.props';
import { Avatar } from '@ui/primitives/avatar';
import Link from 'next/link';

const EMPTY_CELL = '-';

/**
 * A person in a table cell: avatar, name, and the email muted on a second
 * line. The one cell every admin table uses for a user or an owner, so they
 * read the same everywhere. With no name the email is the first line, and an
 * email that is also the name is not shown twice.
 */
export default function TableUserCell({
  avatar,
  email,
  emptyLabel = EMPTY_CELL,
  href,
  linkLabel,
  name,
}: TableUserCellProps) {
  const primary = name?.trim() || email?.trim();

  if (!primary) {
    return <span className="text-foreground/40">{emptyLabel}</span>;
  }

  const secondary = email?.trim() && email.trim() !== primary ? email : null;

  const content = (
    <>
      <Avatar
        alt={primary}
        name={primary}
        size="sm"
        src={avatar ?? undefined}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{primary}</span>
        {secondary ? (
          <span className="truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </span>
    </>
  );

  return href ? (
    <Link
      aria-label={linkLabel}
      className="flex min-w-0 items-center gap-2 hover:text-primary"
      href={href}
    >
      {content}
    </Link>
  ) : (
    <span className="flex min-w-0 items-center gap-2">{content}</span>
  );
}
