import type { LayoutProps } from '@props/layout/layout.props';
import type { ReactNode } from 'react';

export interface ProtectedAuthGateProps extends LayoutProps {
  /**
   * Shown until the session and its API token are ready. Defaults to nothing;
   * the app shell passes its loading frame so the screen never goes blank.
   */
  fallback?: ReactNode;
}
