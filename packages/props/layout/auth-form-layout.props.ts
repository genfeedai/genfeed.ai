import type { ReactNode } from 'react';

export type AuthFormLayoutLogoSize = 'default' | 'compact';

interface AuthFormLayoutBaseProps {
  children: ReactNode;
  headingIcon?: ReactNode;
  /** Widen the compact card for two-column content such as OAuth consent. */
  isWide?: boolean;
  logoSize?: AuthFormLayoutLogoSize;
}

type AuthFormLayoutHeadingProps =
  | {
      description: ReactNode;
      title: string;
    }
  | {
      description?: never;
      title?: never;
    };

export type AuthFormLayoutProps = AuthFormLayoutBaseProps &
  AuthFormLayoutHeadingProps;
