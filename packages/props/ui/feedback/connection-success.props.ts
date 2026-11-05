import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

/** Agents that connect to Genfeed through MCP. */
export type ConnectionAgent =
  | 'chatgpt'
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'generic'
  | 'grok';

/** The logo, brand colour and display name a connection success state shows. */
export interface ConnectionBrand {
  Icon: IconComponent;
  /** Brand colour; omitted for monochrome marks that follow the theme foreground. */
  color?: string;
  name: string;
}

/** The account that was just connected, shown as its picture with the platform logo on it. */
export interface ConnectionAccount {
  /** Profile picture URL; initials from `name` show until it loads or when it is missing. */
  avatarUrl?: string | null;
  name?: string | null;
}

export interface ConnectionSuccessProps {
  /** Connected social account. Without it the success state shows the platform logo alone. */
  account?: ConnectionAccount | null;
  brand: ConnectionBrand;
  className?: string;
  description?: ReactNode;
  /** Announced through an aria-live region, e.g. "Connected to Instagram". */
  title: string;
}
