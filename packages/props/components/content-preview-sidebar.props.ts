import type { CredentialPlatform } from '@genfeedai/enums';

export interface ContentPreviewSidebarProps {
  title?: string;
  content: string;
  platform?: string | CredentialPlatform;
  subtitle?: string;
  subreddit?: string;
  titleMaxLength?: number;
  contentMaxLength?: number;
  className?: string;
  onItemClick?: (index: number) => void;
  activeIndex?: number;
  items?: Array<{ content: string; index: number }>;
  readyCount?: number;
  showCharacterCount?: boolean;
  emptyMessage?: string;
}
