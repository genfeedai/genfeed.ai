/** One connected account shown in a platform avatar stack. */
export interface PlatformAvatarStackItem {
  id: string;
  platform: string;
  label?: string | null;
  username?: string | null;
}

export interface PlatformAvatarStackProps {
  items: readonly PlatformAvatarStackItem[];
  /** Avatars shown before the "+N" overflow chip. Defaults to 3. */
  max?: number;
  /** Shown when there is nothing connected. Defaults to "-". */
  emptyLabel?: string;
  className?: string;
}
