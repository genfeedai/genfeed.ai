'use client';

import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { EnvironmentService } from '@services/core/environment.service';
import { useCallback, useRef, useState } from 'react';

export type StudioCrunRestoreStatus = 'pending' | 'failed' | null;

export interface UseStudioCrunRestoreParams {
  brandId: string;
  organizationId: string;
}

/**
 * Tracks the scope (brand, organization, session, API) a restored crun draft
 * belongs to. A scope switch bumps the restore epoch, so an in-flight restore
 * for the old scope is discarded instead of landing in the new one.
 */
export function useStudioCrunRestore({
  brandId,
  organizationId,
}: UseStudioCrunRestoreParams) {
  const authIdentity = useAuthIdentity();
  const crunRestoreScope = JSON.stringify([
    brandId,
    organizationId,
    authIdentity.userId,
    authIdentity.sessionId,
    EnvironmentService.apiEndpoint,
  ]);
  const crunRestoreScopeRef = useRef(crunRestoreScope);
  const crunRestoreEpochRef = useRef(0);
  // Counts scope switches only: composer edits bump the restore epoch too, and
  // must not close an open focused preview.
  const scopeEpochRef = useRef(0);
  if (crunRestoreScopeRef.current !== crunRestoreScope) {
    crunRestoreEpochRef.current += 1;
    scopeEpochRef.current += 1;
    crunRestoreScopeRef.current = crunRestoreScope;
  }
  const [crunRestoreStatus, setCrunRestoreStatus] =
    useState<StudioCrunRestoreStatus>(null);
  const clearCrunRestore = useCallback(() => {
    crunRestoreEpochRef.current += 1;
    setCrunRestoreStatus(null);
  }, []);
  // The scope epoch fences A → B → A changes without reviving the old selection.
  const focusedScopeKey = `${crunRestoreScope}:${scopeEpochRef.current}`;

  return {
    clearCrunRestore,
    crunRestoreEpochRef,
    crunRestoreScope,
    crunRestoreScopeRef,
    crunRestoreStatus,
    focusedScopeKey,
    setCrunRestoreStatus,
  };
}
