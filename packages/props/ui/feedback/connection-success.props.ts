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

export interface ConnectionSuccessProps {
  brand: ConnectionBrand;
  className?: string;
  description?: ReactNode;
  /** Announced through an aria-live region, e.g. "Connected to Instagram". */
  title: string;
}
