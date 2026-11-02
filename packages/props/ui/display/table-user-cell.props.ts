export interface TableUserCellProps {
  /** Profile picture; the avatar falls back to initials of the name or email. */
  avatar?: string | null;
  /** The user's email. Shown muted under the name, or alone when there is no name. */
  email?: string | null;
  /** Where the cell goes on click; omitted, the cell is not a link. */
  href?: string;
  /** Accessible name of the link, translated by the caller. */
  linkLabel?: string;
  /** Display name. A name that is only the email is not repeated. */
  name?: string | null;
  /** Shown when there is neither a name nor an email. */
  emptyLabel?: string;
}
