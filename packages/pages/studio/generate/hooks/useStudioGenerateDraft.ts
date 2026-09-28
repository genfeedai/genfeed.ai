'use client';

import type { IStudioGenerateDraft } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  StudioGenerateDraftPayload,
  StudioGenerateDraftSaveStatus,
} from '@pages/studio/generate/types';
import { StudioGenerateDraftsService } from '@services/content/studio-generate-drafts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Quiet period after the last composer change before the draft is saved. */
export const STUDIO_GENERATE_DRAFT_SAVE_DELAY_MS = 500;
const STUDIO_GENERATE_DRAFT_RETRY_BASE_MS = 2000;
const STUDIO_GENERATE_DRAFT_RETRY_MAX_MS = 30_000;

export interface UseStudioGenerateDraftParams {
  brandId: string;
  /**
   * The composer is ready to be restored into: local settings are hydrated
   * and any Agent handoff in the URL has resolved.
   */
  canRestore: boolean;
  /** Autosave is paused while the composer edits something else (a remix run). */
  isAutosaveEnabled: boolean;
  /**
   * An Agent handoff or remix run owns the composer: the saved draft is not
   * restored over it, but autosave still starts once it is loaded.
   */
  isRestoreBlocked: boolean;
  /**
   * Applies a restored draft to the composer and resolves with the number of
   * references it could not show (no longer resolvable on the client).
   */
  onRestore: (
    draft: IStudioGenerateDraft,
    signal: AbortSignal,
  ) => Promise<number>;
  payload: StudioGenerateDraftPayload;
}

export interface UseStudioGenerateDraftReturn {
  saveStatus: StudioGenerateDraftSaveStatus;
}

function serializeDraftPayload(payload: StudioGenerateDraftPayload): string {
  return JSON.stringify(payload);
}

/**
 * Server-side Generate composer draft for the active user and brand. The
 * saved draft is restored once per brand, then every composer change is
 * saved after a short quiet period; a failed save is retried with backoff
 * and reported through `saveStatus` while the composer stays usable.
 */
export function useStudioGenerateDraft({
  brandId,
  canRestore,
  isAutosaveEnabled,
  isRestoreBlocked,
  onRestore,
  payload,
}: UseStudioGenerateDraftParams): UseStudioGenerateDraftReturn {
  const translate = useTranslations('pages.studioGenerate');
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getDraftsService = useAuthedService((token: string) =>
    StudioGenerateDraftsService.getInstance(token),
  );
  const [loadedBrandId, setLoadedBrandId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] =
    useState<StudioGenerateDraftSaveStatus>('idle');
  const payloadKey = useMemo(() => serializeDraftPayload(payload), [payload]);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const lastSavedKeyRef = useRef<string | null>(null);
  const saveControllerRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const isRestoreBlockedRef = useRef(isRestoreBlocked);
  isRestoreBlockedRef.current = isRestoreBlocked;
  const isArmed = loadedBrandId !== null && loadedBrandId === brandId;

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const save = useCallback(async () => {
    const nextPayload = payloadRef.current;
    const key = serializeDraftPayload(nextPayload);
    if (key === lastSavedKeyRef.current) {
      return;
    }

    clearRetry();
    saveControllerRef.current?.abort();
    const controller = new AbortController();
    saveControllerRef.current = controller;
    setSaveStatus('saving');

    try {
      const service = await getDraftsService();
      await service.saveCurrent(nextPayload, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      lastSavedKeyRef.current = key;
      retryAttemptRef.current = 0;
      setSaveStatus('saved');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      logger.error('Failed to save the Studio composer draft', error);
      setSaveStatus('error');
      const delay = Math.min(
        STUDIO_GENERATE_DRAFT_RETRY_BASE_MS * 2 ** retryAttemptRef.current,
        STUDIO_GENERATE_DRAFT_RETRY_MAX_MS,
      );
      retryAttemptRef.current += 1;
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        void save();
      }, delay);
    }
  }, [clearRetry, getDraftsService]);

  // Restore once per brand. Autosave stays disarmed until the restore has
  // fully landed, so a half-applied draft is never written back.
  useEffect(() => {
    if (!brandId || !canRestore || loadedBrandId === brandId) {
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getDraftsService();
        const draft = await service.getCurrent(controller.signal);
        if (controller.signal.aborted) {
          return;
        }

        if (draft && !isRestoreBlockedRef.current) {
          const unresolvedCount = await onRestoreRef.current(
            draft,
            controller.signal,
          );
          if (controller.signal.aborted) {
            return;
          }
          const droppedCount =
            draft.droppedReferenceIds.length + unresolvedCount;
          if (droppedCount > 0) {
            notificationsService.warning(
              translate('draft.referencesDropped', { count: droppedCount }),
            );
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        // The composer stays usable without its draft; the next change
        // saves a fresh one.
        logger.error('Failed to restore the Studio composer draft', error);
      }

      // The restored state is what the server already holds; only a later
      // change needs saving.
      lastSavedKeyRef.current = serializeDraftPayload(payloadRef.current);
      setLoadedBrandId(brandId);
    })();

    return () => controller.abort();
  }, [
    brandId,
    canRestore,
    getDraftsService,
    loadedBrandId,
    notificationsService,
    translate,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: payloadKey is the change signal; save() reads the latest payload through a ref.
  useEffect(() => {
    if (!isArmed || !isAutosaveEnabled) {
      return;
    }

    const timer = window.setTimeout(() => {
      void save();
    }, STUDIO_GENERATE_DRAFT_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isArmed, isAutosaveEnabled, payloadKey, save]);

  // A reload inside the quiet period would otherwise lose the last keystrokes.
  useEffect(() => {
    if (!isArmed || !isAutosaveEnabled) {
      return;
    }

    const flush = () => {
      if (document.visibilityState === 'hidden') {
        void save();
      }
    };
    const flushOnPageHide = () => {
      void save();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flushOnPageHide);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flushOnPageHide);
    };
  }, [isArmed, isAutosaveEnabled, save]);

  // A brand switch starts from that brand's draft: drop anything in flight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: brandId is the reset trigger.
  useEffect(() => {
    return () => {
      clearRetry();
      saveControllerRef.current?.abort();
      saveControllerRef.current = null;
      retryAttemptRef.current = 0;
      lastSavedKeyRef.current = null;
    };
  }, [brandId, clearRetry]);

  return { saveStatus: isArmed ? saveStatus : 'idle' };
}
