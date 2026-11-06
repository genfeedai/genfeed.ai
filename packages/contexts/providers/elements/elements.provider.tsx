'use client';

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
} from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@genfeedai/hooks/auth/use-authed-query/use-authed-query';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { logger } from '@genfeedai/services/core/logger.service';
import {
  type ElementsData,
  ElementsService,
} from '@genfeedai/services/elements/elements.service';
import { useElementsFilters } from '@providers/elements-filters/elements-filters.context';
import { ElementsFiltersProvider } from '@providers/elements-filters/elements-filters.provider';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { ElementsContext, type ElementsContextValue } from './elements.context';

const EMPTY_MOODS: IElementMood[] = [];
const EMPTY_STYLES: IElementStyle[] = [];
const EMPTY_CAMERAS: IElementCamera[] = [];
const EMPTY_BLACKLISTS: IElementBlacklist[] = [];
const EMPTY_SOUNDS: ISound[] = [];
const EMPTY_SCENES: IElementScene[] = [];
const EMPTY_LIGHTINGS: IElementLighting[] = [];
const EMPTY_LENSES: IElementLens[] = [];
const EMPTY_CAMERA_MOVEMENTS: IElementCameraMovement[] = [];

/** The elements endpoint takes the raw token, so the "service" is the token. */
function elementsToken(token: string): string {
  return token;
}

async function loadElements(
  token: string,
  signal: AbortSignal,
): Promise<ElementsData> {
  try {
    const elementsData = await ElementsService.findAllElements(token, signal);
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

    return elementsData;
  } catch (err) {
    if (!signal.aborted) {
      logger.error('Failed to load core elements', err);
    }
    throw err;
  }
}

function ElementsProviderContent({
  children,
  enabled,
}: LayoutProps & { enabled: boolean }): ReactNode {
  const { isLoaded: isAuthLoaded, isSignedIn, sessionId } = useAuthIdentity();

  const {
    filters,
    setFilters,
    query,
    setQuery,
    isRefreshing,
    setIsRefreshing,
  } = useElementsFilters();

  // Nine catalogs load in one call and only a few screens read them, so
  // nothing is fetched until a consumer mounts and calls `requestLoad`.
  const [hasDemand, setHasDemand] = useState(false);
  const requestLoad = useCallback(() => setHasDemand(true), []);
  const refreshCallbacksRef = useRef<Array<() => Promise<void> | void>>([]);

  const hasActiveSession = enabled && Boolean(isSignedIn);

  // Cached per session (and viewer): reopening a screen that reads the
  // elements paints them at once and refreshes them in the background.
  const elementsQuery = useAuthedQuery<string, ElementsData>({
    enabled: Boolean(isAuthLoaded) && hasActiveSession && hasDemand,
    queryFn: loadElements,
    queryKey: ['elements-catalogs', sessionId ?? null],
    service: elementsToken,
  });
  const {
    data: elements,
    error: elementsError,
    isFetching,
    isPending,
    refetch: refetchElements,
  } = elementsQuery;
  const hasElements = elements !== undefined;
  const isElementsLoading = !hasElements && (isPending || isFetching);
  // A failed background refresh keeps the loaded elements and reports nothing.
  const error = !hasElements && !isFetching ? elementsError : null;

  const exposedIsLoading =
    enabled && !isAuthLoaded
      ? true
      : hasActiveSession
        ? isElementsLoading
        : false;

  const refetch = useCallback(async () => {
    setIsRefreshing(true);

    try {
      if (hasActiveSession) {
        await refetchElements();
      }

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
  }, [hasActiveSession, refetchElements, setIsRefreshing]);

  const onRefresh = useCallback((callback: () => Promise<void> | void) => {
    refreshCallbacksRef.current.push(callback);
    return () => {
      refreshCallbacksRef.current = refreshCallbacksRef.current.filter(
        (cb) => cb !== callback,
      );
    };
  }, []);

  const visible = hasActiveSession ? elements : undefined;

  const value = useMemo<ElementsContextValue>(
    () => ({
      blacklists: visible?.blacklists || EMPTY_BLACKLISTS,
      cameraMovements: visible?.cameraMovements || EMPTY_CAMERA_MOVEMENTS,
      cameras: visible?.cameras || EMPTY_CAMERAS,
      error: hasActiveSession ? error : null,
      filters,
      isLoading: exposedIsLoading,
      isRefreshing,
      lenses: visible?.lenses || EMPTY_LENSES,
      lightings: visible?.lightings || EMPTY_LIGHTINGS,
      moods: visible?.moods || EMPTY_MOODS,
      onRefresh,
      query,
      refetch,
      requestLoad,
      scenes: visible?.scenes || EMPTY_SCENES,
      setFilters,
      setIsRefreshing,
      setQuery,
      sounds: visible?.sounds || EMPTY_SOUNDS,
      styles: visible?.styles || EMPTY_STYLES,
    }),
    [
      error,
      exposedIsLoading,
      filters,
      hasActiveSession,
      isRefreshing,
      onRefresh,
      query,
      refetch,
      requestLoad,
      setFilters,
      setIsRefreshing,
      setQuery,
      visible,
    ],
  );

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
