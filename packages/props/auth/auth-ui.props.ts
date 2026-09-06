import type { ReactNode } from 'react';

export interface AuthBackLinkProps {
  href: string;
}

export interface AuthFormActionsProps {
  backHref: string;
  children: ReactNode;
}

export interface AuthCheckEmailProps {
  backHref: string;
}
