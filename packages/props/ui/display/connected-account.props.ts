import type { ReactNode } from 'react';

export type ConnectedAccountSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** The facts every surface needs to show one connected social account. */
export interface ConnectedAccountData {
  platform: string;
  /** The account's own profile picture (`credentials.externalAvatar`). */
  avatarUrl?: string | null;
  /** Operator label or provider display name. */
  name?: string | null;
  /** Provider handle, with or without the leading `@`. */
  handle?: string | null;
}

export interface ConnectedAccountAvatarProps {
  account: ConnectedAccountData;
  size?: ConnectedAccountSize;
  className?: string;
  /** Leaves the platform badge off, where the platform is already shown beside the avatar. */
  hasBadge?: boolean;
  /** Hides the avatar from assistive tech when the account's name is written beside it. */
  isDecorative?: boolean;
}

export interface ConnectedAccountProps {
  account: ConnectedAccountData;
  size?: ConnectedAccountSize;
  /**
   * `inline` is one line: avatar and `@handle`.
   * `stacked` adds the account name above the handle, for rows and cards.
   */
  layout?: 'inline' | 'stacked';
  /** Extra text after the handle on the second line (`stacked` only). */
  meta?: ReactNode;
  className?: string;
}

/** One account in a stack: the account plus a stable key. */
export interface ConnectedAccountStackItem extends ConnectedAccountData {
  id: string;
}

export interface ConnectedAccountStackProps {
  items: readonly ConnectedAccountStackItem[];
  /** Avatars shown before the "+N" overflow chip. Defaults to 3. */
  max?: number;
  /** Shown when there is nothing connected. Defaults to "-". */
  emptyLabel?: string;
  className?: string;
}
