import type { ReactNode } from 'react';

export type AuthFormLayoutLogoSize = 'default' | 'compact';

export interface AuthFormLayoutProps {
  children: ReactNode;
  compactHeading?: ReactNode;
  logoSize?: AuthFormLayoutLogoSize;
}
