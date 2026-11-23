import type { ReactNode } from 'react';

type ConnectedAccountSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

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
  /** Leaves the platform badge off, where the platform is already shown beside the stack. */
  hasBadge?: boolean;
  /**
   * `false` draws the avatars only: no hover list, no button. For a stack that
   * sits inside a clickable tile, where a button would nest in a button and the
   * tile already says how many are connected.
   */
  isInteractive?: boolean;
  size?: ConnectedAccountSize;
}

/** One account in an `AccountPicker`. */
export interface AccountPickerItem extends ConnectedAccountData {
  id: string;
  isDisabled?: boolean;
  /**
   * For a choice that is not one account (an "All channels" view): replaces
   * the avatar and names the item. `platform` is ignored for the picture.
   */
  icon?: ReactNode;
  label?: string;
  /**
   * Shown after the handle in the hover hint and read by assistive tech, such
   * as "Needs reconnect". A warning dot also sits on the avatar.
   */
  warning?: string;
}

interface AccountPickerBaseProps {
  /** Names the row for assistive tech ("Accounts"). */
  ariaLabel: string;
  items: readonly AccountPickerItem[];
  /** Layout only: width, margin, alignment. */
  className?: string;
  isDisabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  testId?: string;
}

interface AccountPickerSingleProps {
  /** Pressing the chosen account again clears the choice. */
  isDeselectable?: boolean;
  onValueChange: (id: string | undefined) => void;
  type?: 'single';
  value: string | undefined;
}

interface AccountPickerMultipleProps {
  isDeselectable?: never;
  onValueChange: (ids: string[]) => void;
  type: 'multiple';
  value: readonly string[];
}

export type AccountPickerProps = AccountPickerBaseProps &
  (AccountPickerSingleProps | AccountPickerMultipleProps);
