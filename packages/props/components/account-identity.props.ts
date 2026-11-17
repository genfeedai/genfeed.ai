import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

export type AccountIdentityProps = {
  name: string;
  /** Already formatted, for example `@brand`. */
  handle?: string;
  avatarUrl?: string | null;
  avatarAlt: string;
  platformLabel: string;
  PlatformIcon?: IconComponent;
  meta?: ReactNode;
};
