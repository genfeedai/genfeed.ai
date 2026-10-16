'use client';

import type { GlobalModalsContextValue } from '@genfeedai/props/modals/global-modals.props';
import { createContext, use } from 'react';

export const GlobalModalsContext =
  createContext<GlobalModalsContextValue | null>(null);

/**
 * The confirm dialog, or `null` where no `GlobalModalsProvider` is mounted
 * (the public profile mounts none). Lives apart from the provider so a
 * surface without the provider does not load its modal graph.
 */
export function useOptionalConfirmModal(): Pick<
  GlobalModalsContextValue,
  'openConfirm'
> | null {
  const context = use(GlobalModalsContext);
  return context ? { openConfirm: context.openConfirm } : null;
}
