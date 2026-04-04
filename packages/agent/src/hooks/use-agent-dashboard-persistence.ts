'use client';

import type {
  AgentUIBlock,
  DashboardPreferenceScope,
  DashboardPreferences,
  DashboardScopePreferences,
} from '@genfeedai/interfaces';
import { useEffect, useRef } from 'react';

interface DashboardPreferencesShape {
  scopes?: DashboardPreferences['scopes'];
}

interface DashboardPersistenceUser {
  id: string;
  settings?: {
    dashboardPreferences?: DashboardPreferencesShape;
  };
}

interface UseAgentDashboardPersistenceOptions {
  scope: DashboardPreferenceScope;
  currentUser: DashboardPersistenceUser | null | undefined;
  getLocalSnapshot: () => { blocks: AgentUIBlock[]; isAgentModified: boolean };
  hydrateState: (state: {
    blocks: AgentUIBlock[];
    isAgentModified: boolean;
  }) => void;
  blocks: AgentUIBlock[];
  isAgentModified: boolean;
  persistState: (
    userId: string,
    patch: {
      dashboardPreferences: {
        scopes: Record<string, DashboardScopePreferences>;
      };
    },
  ) => Promise<void>;
  updateLocalUser?: (nextScopeState: DashboardScopePreferences) => void;
  disabled?: boolean;
  version?: number;
}

export function useAgentDashboardPersistence({
  scope,
  currentUser,
  getLocalSnapshot,
  hydrateState,
  blocks,
  isAgentModified,
  persistState,
  updateLocalUser,
  disabled = false,
  version = 1,
}: UseAgentDashboardPersistenceOptions): void {
  const hasResolvedPersistenceRef = useRef(false);
  const lastPersistedSnapshotRef = useRef<string | null>(null);
  const usedLocalFallbackRef = useRef(false);

  useEffect(() => {
    if (disabled || hasResolvedPersistenceRef.current || currentUser) {
      return;
    }

    const localSnapshot = getLocalSnapshot();
    if (localSnapshot.blocks.length > 0 || localSnapshot.isAgentModified) {
      hydrateState(localSnapshot);
      lastPersistedSnapshotRef.current = JSON.stringify(localSnapshot);
      usedLocalFallbackRef.current = true;
    }
  }, [currentUser, disabled, getLocalSnapshot, hydrateState]);

  useEffect(() => {
    if (disabled || hasResolvedPersistenceRef.current || !currentUser) {
      return;
    }

    const dbScopePreference =
      currentUser.settings?.dashboardPreferences?.scopes?.[scope];

    if (dbScopePreference) {
      const nextState = {
        blocks: dbScopePreference.blocks || [],
        isAgentModified: Boolean(dbScopePreference.isAgentModified),
      };
      hydrateState(nextState);
      lastPersistedSnapshotRef.current = JSON.stringify(nextState);
      hasResolvedPersistenceRef.current = true;
      return;
    }

    const localSnapshot = getLocalSnapshot();
    if (
      !usedLocalFallbackRef.current &&
      (localSnapshot.blocks.length > 0 || localSnapshot.isAgentModified)
    ) {
      hydrateState(localSnapshot);
      lastPersistedSnapshotRef.current = JSON.stringify(localSnapshot);
    }

    hasResolvedPersistenceRef.current = true;
  }, [currentUser, disabled, getLocalSnapshot, hydrateState, scope]);

  useEffect(() => {
    if (disabled || !hasResolvedPersistenceRef.current || !currentUser) {
      return;
    }

    const snapshot = JSON.stringify({
      blocks,
      isAgentModified,
    });
    if (lastPersistedSnapshotRef.current === snapshot) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const nextScopeState: DashboardScopePreferences = {
        blocks,
        isAgentModified,
        updatedAt: new Date().toISOString(),
        version,
      };

      try {
        await persistState(currentUser.id, {
          dashboardPreferences: {
            scopes: {
              [scope]: nextScopeState,
            },
          },
        });
        lastPersistedSnapshotRef.current = snapshot;
        updateLocalUser?.(nextScopeState);
      } catch {
        // Non-fatal: keep local in-memory state even if DB persistence fails.
      }
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    blocks,
    currentUser,
    disabled,
    isAgentModified,
    persistState,
    scope,
    updateLocalUser,
    version,
  ]);
}
