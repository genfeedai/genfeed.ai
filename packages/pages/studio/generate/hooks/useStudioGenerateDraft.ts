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

/** Key order matches the composer's payload so equal content compares equal. */
function serializeDraftPayload(payload: StudioGenerateDraftPayload): string {
  return JSON.stringify({
    attachments: payload.attachments,
    knowledgeSelection: payload.knowledgeSelection,
    prompt: payload.prompt,
    references: payload.references,
    settingsByType: payload.settingsByType,
    type: payload.type,
  });
}

/** What the creator types or attaches — settings are not an edit to protect. */
function serializeDraftContent(payload: StudioGenerateDraftPayload): string {
  return JSON.stringify([
    payload.prompt,
    payload.references,
    payload.attachments,
  ]);
}

function hasDraftContent(payload: StudioGenerateDraftPayload): boolean {
  return (
    payload.prompt.trim().length > 0 ||
    payload.references.length > 0 ||
    payload.attachments.length > 0
  );
}

function retryDelay(attempt: number): number {
  return Math.min(
    STUDIO_GENERATE_DRAFT_RETRY_BASE_MS * 2 ** attempt,
    STUDIO_GENERATE_DRAFT_RETRY_MAX_MS,
  );
}

/**
 * Server-side Generate composer draft for the active user and the brand open
 * in this tab. The saved draft is restored once per brand — unless the
 * creator already started editing — and every later change is saved after a
 * short quiet period. Writes are serialized: when one lands, the latest
 * composer is compared with what the server acknowledged and saved again if
 * they differ. Pending edits are flushed when the brand changes, the
 * workspace unmounts, or the page hides. A failed save is retried with
 * backoff and reported through `saveStatus` while the composer stays usable.
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] =
    useState<StudioGenerateDraftSaveStatus>('idle');
  const payloadKey = useMemo(() => serializeDraftPayload(payload), [payload]);

  // The last committed composer. Updated in an effect, not during render, so
  // a brand-switch cleanup still sees the composer of the brand being left.
  const payloadRef = useRef(payload);
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);
  const getDraftsServiceRef = useRef(getDraftsService);
  getDraftsServiceRef.current = getDraftsService;
  // Read through a ref: a new `translate` identity must never re-run the load.
  const translateRef = useRef(translate);
  translateRef.current = translate;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const isRestoreBlockedRef = useRef(isRestoreBlocked);
  isRestoreBlockedRef.current = isRestoreBlocked;
  const isAutosaveEnabledRef = useRef(isAutosaveEnabled);
  isAutosaveEnabledRef.current = isAutosaveEnabled;

  /** Brand whose server baseline is known; saves go only to it. */
  const armedBrandRef = useRef<string | null>(null);
  /** Serialized payload the server last acknowledged for the armed brand. */
  const acknowledgedKeyRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);
  const isKeepaliveRequestedRef = useRef(false);
  const saveRetryTimerRef = useRef<number | null>(null);
  const saveRetryAttemptRef = useRef(0);
  const loadRetryAttemptRef = useRef(0);
  const isArmed = loadedBrandId !== null && loadedBrandId === brandId;

  const clearSaveRetry = useCallback(() => {
    if (saveRetryTimerRef.current !== null) {
      window.clearTimeout(saveRetryTimerRef.current);
      saveRetryTimerRef.current = null;
    }
  }, []);

  // Stable on purpose: it reads everything through refs, so the brand-change
  // cleanup below never fires for an identity change alone.
  const flush = useCallback(
    (options: { isKeepalive?: boolean } = {}) => {
      if (options.isKeepalive) {
        isKeepaliveRequestedRef.current = true;
      }
      // One write at a time. The running loop re-reads the latest composer
      // when its request lands, so nothing requested meanwhile is lost.
      if (isSavingRef.current) {
        return;
      }
      isSavingRef.current = true;

      void (async () => {
        try {
          for (;;) {
            // Captured before any await: a brand switch or unmount that
            // triggered this flush still saves to the brand it was edited in.
            const targetBrandId = armedBrandRef.current;
            if (!targetBrandId || !isAutosaveEnabledRef.current) {
              return;
            }
            const nextPayload = payloadRef.current;
            const key = serializeDraftPayload(nextPayload);
            if (key === acknowledgedKeyRef.current) {
              return;
            }

            clearSaveRetry();
            setSaveStatus('saving');
            const isKeepalive = isKeepaliveRequestedRef.current;
            try {
              const service = await getDraftsServiceRef.current();
              await service.saveCurrent(targetBrandId, nextPayload, {
                isKeepalive,
              });
            } catch (error) {
              logger.error('Failed to save the Studio composer draft', error);
              if (armedBrandRef.current !== targetBrandId) {
                return;
              }
              setSaveStatus('error');
              const delay = retryDelay(saveRetryAttemptRef.current);
              saveRetryAttemptRef.current += 1;
              saveRetryTimerRef.current = window.setTimeout(() => {
                saveRetryTimerRef.current = null;
                flush();
              }, delay);
              return;
            }

            if (armedBrandRef.current !== targetBrandId) {
              return;
            }
            acknowledgedKeyRef.current = key;
            saveRetryAttemptRef.current = 0;
            setSaveStatus('saved');
          }
        } finally {
          isSavingRef.current = false;
        }
      })();
    },
    [clearSaveRetry],
  );

  // Restore once per brand. Autosave stays disarmed until the server's draft
  // is known, so a failed or half-applied load is never written back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt re-runs the load after a failure.
  useEffect(() => {
    if (!brandId || !canRestore || loadedBrandId === brandId) {
      return;
    }

    const controller = new AbortController();
    let retryTimer: number | null = null;
    const contentAtStart = serializeDraftContent(payloadRef.current);

    void (async () => {
      try {
        const service = await getDraftsServiceRef.current();
        const draft = await service.getCurrent(brandId, controller.signal);
        if (controller.signal.aborted) {
          return;
        }

        // Typing before the draft arrived wins over the older saved draft.
        const isEditedWhileLoading =
          serializeDraftContent(payloadRef.current) !== contentAtStart;
        if (draft && !isRestoreBlockedRef.current && !isEditedWhileLoading) {
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
              translateRef.current('draft.referencesDropped', {
                count: droppedCount,
              }),
            );
          }
        }

        // The baseline is what the server holds. Composer content that
        // differs from it (an Agent handoff, early typing) stays dirty and is
        // saved by the autosave below.
        acknowledgedKeyRef.current = draft
          ? serializeDraftPayload(draft)
          : hasDraftContent(payloadRef.current)
            ? null
            : serializeDraftPayload(payloadRef.current);
        armedBrandRef.current = brandId;
        loadRetryAttemptRef.current = 0;
        setLoadedBrandId(brandId);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to restore the Studio composer draft', error);
        retryTimer = window.setTimeout(() => {
          setLoadAttempt((attempt) => attempt + 1);
        }, retryDelay(loadRetryAttemptRef.current));
        loadRetryAttemptRef.current += 1;
      }
    })();

    return () => {
      controller.abort();
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [brandId, canRestore, loadAttempt, loadedBrandId, notificationsService]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: payloadKey is the change signal; flush() reads the latest payload through a ref.
  useEffect(() => {
    if (!isArmed || !isAutosaveEnabled) {
      return;
    }

    const timer = window.setTimeout(() => {
      flush();
    }, STUDIO_GENERATE_DRAFT_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [flush, isAutosaveEnabled, isArmed, payloadKey]);

  // A reload or tab close inside the quiet period would otherwise lose the
  // last keystrokes; keepalive lets that final write outlive the page.
  useEffect(() => {
    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') {
        flush({ isKeepalive: true });
      }
    };
    const flushOnPageHide = () => {
      flush({ isKeepalive: true });
    };
    document.addEventListener('visibilitychange', flushOnHide);
    window.addEventListener('pagehide', flushOnPageHide);
    return () => {
      document.removeEventListener('visibilitychange', flushOnHide);
      window.removeEventListener('pagehide', flushOnPageHide);
    };
  }, [flush]);

  // Leaving the brand — a brand switch or an in-app navigation away from
  // Generate — saves what was typed under that brand first, then disarms.
  // biome-ignore lint/correctness/useExhaustiveDependencies: brandId is the departure trigger.
  useEffect(() => {
    return () => {
      flush({ isKeepalive: true });
      armedBrandRef.current = null;
      clearSaveRetry();
      saveRetryAttemptRef.current = 0;
    };
  }, [brandId, clearSaveRetry, flush]);

  return { saveStatus: isArmed ? saveStatus : 'idle' };
}
