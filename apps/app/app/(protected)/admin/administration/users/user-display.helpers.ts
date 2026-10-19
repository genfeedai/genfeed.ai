import type { IUser } from '@genfeedai/contracts/interfaces';

/** Placeholder for a value the user record does not carry. */
export const EMPTY_VALUE = '—';

/** The user's display name, or `undefined` when none was ever captured. */
export function getUserDisplayName(user: IUser): string | undefined {
  const splitName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return user.name?.trim() || splitName || undefined;
}

/** One letter for the avatar fallback: the name, else the email, else "?". */
export function getUserInitial(user: IUser): string {
  const source = getUserDisplayName(user) ?? user.email;
  return source?.trim().charAt(0).toUpperCase() || '?';
}
