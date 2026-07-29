import type { ReactNode } from 'react';

interface AuthActionSurfaceBaseProps {
  actions: ReactNode;
  className?: string;
  error?: ReactNode;
  footer?: ReactNode;
  supportingCopy?: ReactNode;
}

type AuthActionSurfaceHeadingProps =
  | {
      description: string;
      hideHeading?: false;
      title: string;
    }
  | {
      description?: never;
      hideHeading: true;
      title?: never;
    };

export type AuthActionSurfaceProps = AuthActionSurfaceBaseProps &
  AuthActionSurfaceHeadingProps;
