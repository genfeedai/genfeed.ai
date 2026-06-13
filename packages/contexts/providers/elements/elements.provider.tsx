'use client';

import { useAuth } from '@clerk/nextjs';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type {
  IElementBlacklist,
  IElementCamera,
  IElementCameraMovement,
  IElementLens,
  IElementLighting,
  IElementMood,
  IElementScene,
  IElementStyle,
  ISound,
} from '@genfeedai/interfaces';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { ElementsService } from '@genfeedai/services/elements/elements.service';
import { useElementsFilters } from '@providers/elements-filters/elements-filters.context';
import { ElementsFiltersProvider } from '@providers/elements-filters/elements-filters.provider';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ElementsContext, type ElementsContextValue } from './elements.context';

function ElementsProviderContent({
  children,
  enabled,
}: LayoutProps & { enabled: boolean }): ReactNode {
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    userId,
    orgId,
    sessionId,
  } = useAuth();

  const [moods, setMoods] = useState<IElementMood[]>([]);
  const [styles, setStyles] = useState<IElementStyle[]>([]);
  const [cameras, setCameras] = useState<IElementCamera[]>([]);
  const [blacklists, setBlacklists] = useState<IElementBlacklist[]>([]);
  const [sounds, setSounds] = useState<ISound[]>([]);
  const [scenes, setScenes] = useState<IElementScene[]>([]);
  const [lightings, setLightings] = useState<IElementLighting[]>([]);
  const [lenses, setLenses] = useState<IElementLens[]>([]);
  const [cameraMovements, setCameraMovements] = useState<
    IElementCameraMovement[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const {
    filters,
    setFilters,
    query,
    setQuery,
    isRefreshing,
    setIsRefreshing,
  } = useElementsFilters();

  const findAllElementsService = useAuthedService((token: string) =>
    ElementsService.findAllElements(token),
  );

  const refreshCallbacksRef = useRef<Array<() => Promise<void> | void>>([]);
  const isLoadingRef = useRef(false);
  const lastSessionRef = useRef<{
    userId: string | null;
    orgId: string | null;
    sessionId: string | null;
  }>({
    orgId: null,
    sessionId: null,
    userId: null,
  });

  /* eslint-disable react-doctor/no-adjust-state-on-prop-change -- Async provider resource loading updates state from fetch lifecycle callbacks, not prop mirroring. */
  const findAllElements = useCallback(async () => {
    if (!isSignedIn || !enabled) {
      return;
    }
    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const elementsData = await findAllElementsService();
      if (!elementsData) {
        throw new Error('Failed to load elements data');
      }

      logger.info('Core elements loaded', {
        blacklists: elementsData.blacklists?.length ?? 0,
        cameraMovements: elementsData.cameraMovements?.length ?? 0,
        cameras: elementsData.cameras?.length ?? 0,
        lenses: elementsData.lenses?.length ?? 0,
        lightings: elementsData.lightings?.length ?? 0,
        moods: elementsData.moods?.length ?? 0,
        scenes: elementsData.scenes?.length ?? 0,
        sounds: elementsData.sounds?.length ?? 0,
        styles: elementsData.styles?.length ?? 0,
      });

      setMoods(elementsData.moods || []);
      setStyles(elementsData.styles || []);
      setCameras(elementsData.cameras || []);
      setScenes(elementsData.scenes || []);
      setLightings(elementsData.lightings || []);
      setLenses(elementsData.lenses || []);
      setCameraMovements(elementsData.cameraMovements || []);
      setBlacklists(elementsData.blacklists || []);
      setSounds(elementsData.sounds || []);
      lastSessionRef.current = {
        orgId: orgId ?? null,
        sessionId: sessionId ?? null,
        userId: userId ?? null,
      };
    } catch (err) {
      logger.error('Failed to load core elements', err);
      setError(
        err instanceof Error ? err : new Error('Failed to load elements'),
      );
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [isSignedIn, enabled, findAllElementsService, userId, orgId, sessionId]);
  /* eslint-enable react-doctor/no-adjust-state-on-prop-change */

  useEffect(() => {
    if (!isAuthLoaded || !enabled) {
      return;
    }

    if (!isSignedIn) {
      lastSessionRef.current = {
        orgId: null,
        sessionId: null,
        userId: null,
      };
      isLoadingRef.current = false;
      return;
    }
    const sessionChanged =
      lastSessionRef.current.userId !== (userId ?? null) ||
      lastSessionRef.current.orgId !== (orgId ?? null) ||
      lastSessionRef.current.sessionId !== (sessionId ?? null);

    if (sessionChanged) {
      void findAllElements();
    }
  }, [
    isAuthLoaded,
    isSignedIn,
    enabled,
    userId,
    orgId,
    sessionId,
    findAllElements,
  ]);

  const hasActiveSession = enabled && isSignedIn;
  const exposedIsLoading =
    enabled && !isAuthLoaded ? true : hasActiveSession ? isLoading : false;

  const refetch = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await findAllElements();

      const refreshPromises = refreshCallbacksRef.current.map((callback) =>
        Promise.resolve().then(() => callback()),
      );

      const results = await Promise.allSettled(refreshPromises);

      for (const result of results) {
        if (result.status === 'rejected') {
          logger.error('Elements refresh callback failed', result.reason);
        }
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [findAllElements, setIsRefreshing]);

  const onRefresh = useCallback((callback: () => Promise<void> | void) => {
    refreshCallbacksRef.current.push(callback);
    return () => {
      refreshCallbacksRef.current = refreshCallbacksRef.current.filter(
        (cb) => cb !== callback,
      );
    };
  }, []);

  const value: ElementsContextValue = {
    blacklists: hasActiveSession ? blacklists : [],
    cameraMovements: hasActiveSession ? cameraMovements : [],
    cameras: hasActiveSession ? cameras : [],
    error: hasActiveSession ? error : null,
    filters,
    isLoading: exposedIsLoading,
    isRefreshing,
    lenses: hasActiveSession ? lenses : [],
    lightings: hasActiveSession ? lightings : [],
    moods: hasActiveSession ? moods : [],
    onRefresh,
    query,
    refetch,
    scenes: hasActiveSession ? scenes : [],
    setFilters,
    setIsRefreshing,
    setQuery,
    sounds: hasActiveSession ? sounds : [],
    styles: hasActiveSession ? styles : [],
  };

  return (
    <ElementsContext.Provider value={value}>
      {children}
    </ElementsContext.Provider>
  );
}

export default function ElementsProvider({
  children,
  enabled = true,
}: LayoutProps & { enabled?: boolean }): ReactNode {
  return (
    <ElementsFiltersProvider>
      <ElementsProviderContent enabled={enabled}>
        {children}
      </ElementsProviderContent>
    </ElementsFiltersProvider>
  );
}
