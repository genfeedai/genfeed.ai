import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface AppsMenuRowProps {
  /** The row's one action, on the trailing edge. */
  action: ReactNode;
  badge?: ReactNode;
  /** Content under the row, such as the CLI install command. */
  children?: ReactNode;
  icon: LucideIcon;
  subtitle: ReactNode;
  testId: string;
  title: string;
}

export interface AppsMenuConnectorRowProps {
  /** The Connect Genfeed page; without an organization there is nowhere to go. */
  connectHref: string | null;
  /** Called before the menu follows the link, so the popover closes. */
  onNavigate: () => void;
}

export type AppsMenuPackageManager = 'bun' | 'npm';
