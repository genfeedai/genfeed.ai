'use client';

import { isEEEnabled } from '@/lib/config/edition';
import type { ReactNode } from 'react';

interface EEOnlyProps {
  children: ReactNode;
  /** Optional fallback to render in core mode */
  fallback?: ReactNode;
}

/**
 * Conditionally render children only when EE features are enabled.
 *
 * Usage:
 *   <EEOnly>
 *     <OrgSwitcher />
 *   </EEOnly>
 *
 *   <EEOnly fallback={<FreeBadge />}>
 *     <CreditBalance />
 *   </EEOnly>
 */
export function EEOnly({ children, fallback = null }: EEOnlyProps) {
  if (!isEEEnabled()) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Conditionally render children only in core (self-hosted) mode.
 */
export function CoreOnly({ children, fallback = null }: EEOnlyProps) {
  if (isEEEnabled()) return <>{fallback}</>;
  return <>{children}</>;
}
