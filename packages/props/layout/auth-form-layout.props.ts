import type { ReactNode } from 'react';

export type AuthFormLayoutLogoSize = 'default' | 'compact';

interface AuthFormLayoutBaseProps {
  children: ReactNode;
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
