'use client';

import type { IStudioGenerateDraft } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  StudioGenerateDraftPayload,
  StudioGenerateDraftSaveStatus,
} from '@pages/studio/playground/types';
import {
  StudioPlaygroundDraftRejectedError,
  type StudioPlaygroundDraftWrite,
  studioPlaygroundDraftOutbox,
} from '@pages/studio/playground/utils/studio-playground-draft-outbox';
import { StudioGenerateDraftsService } from '@services/content/studio-generate-drafts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { isServiceOperationError } from '@services/core/operation-error';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Quiet period after the last composer change before the draft is saved. */
export const STUDIO_PLAYGROUND_DRAFT_SAVE_DELAY_MS = 500;
const STUDIO_PLAYGROUND_DRAFT_LOAD_RETRY_BASE_MS = 2000;
const STUDIO_PLAYGROUND_DRAFT_LOAD_RETRY_MAX_MS = 30_000;

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
    canApply: () => boolean,
  ) => Promise<number>;
  payload: StudioGenerateDraftPayload;
}

export interface UseStudioGenerateDraftReturn {
  /** The saved draft for this brand has been read and restored (or skipped). */
  isLoaded: boolean;
  saveStatus: StudioGenerateDraftSaveStatus;
}

/** What the creator types or attaches — settings are not an edit to protect. */
function serializeDraftContent(payload: StudioGenerateDraftPayload): string {
  return JSON.stringify([
    payload.prompt,
    payload.references,
    payload.attachments,
  ]);
}

/**
 * Client errors the same request will always get again. 408 and 429 are
 * worth retrying; so is anything without a status (network, 5xx).
 */
const PERMANENT_DRAFT_WRITE_STATUSES = new Set([400, 403, 404, 409, 410, 422]);

function isPermanentWriteFailure(error: unknown): boolean {
  return (
    isServiceOperationError(error) &&
    error.status !== undefined &&
    PERMANENT_DRAFT_WRITE_STATUSES.has(error.status)
  );
}

function hasDraftContent(payload: StudioGenerateDraftPayload): boolean {
  return (
    payload.prompt.trim().length > 0 ||
    payload.references.length > 0 ||
    payload.attachments.length > 0
  );
}

/**
 * Server-side Generate composer draft for the active user and the brand open
 * in this tab. The saved draft is restored once per brand — unless the
 * creator already started editing — and every later change is queued after
 * a short quiet period. Writes go through the module-level draft outbox,
 * which serializes them, re-saves when the composer changed during a write,
 * retries failures with backoff, and keeps draining after this workspace
 * unmounts. Leaving the brand or the page queues the latest composer first.
 */
export function useStudioPlaygroundDraft({
  brandId,
  canRestore,
  isAutosaveEnabled,
  isRestoreBlocked,
  onRestore,
  payload,
}: UseStudioGenerateDraftParams): UseStudioGenerateDraftReturn {
  const translate = useTranslations('pages.studioPlayground');
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getDraftsService = useAuthedService((token: string) =>
    StudioGenerateDraftsService.getInstance(token),
  );
  // Tags unsent drafts kept in browser storage, so a shared browser never
  // replays one user's draft under another.
  const { userId } = useAuthIdentity();
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const [loadedBrandId, setLoadedBrandId] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] =
    useState<StudioGenerateDraftSaveStatus>('idle');
  const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);

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

  /** Brand whose server baseline is known; writes go only to it. */
  const armedBrandRef = useRef<string | null>(null);
  /**
   * The composer content when this brand's first load attempt started. Kept
   * across retries, so typing during a retry backoff still counts as an edit.
   */
  const loadBaselineRef = useRef<{ brandId: string; content: string } | null>(
    null,
  );
  const loadRetryAttemptRef = useRef(0);
  const isArmed = loadedBrandId !== null && loadedBrandId === brandId;

  // A queued write is bound to the user who typed it: the token is resolved
  // when the write runs, so a write whose owner is no longer signed in here
  // is dropped rather than sent under someone else's session.
  const write = useCallback<StudioPlaygroundDraftWrite>(
    async (targetBrandId, nextPayload, { isKeepalive, ownerId }) => {
      if (ownerId !== userIdRef.current) {
        throw new StudioPlaygroundDraftRejectedError(
          'The draft belongs to a user who is no longer signed in',
        );
      }
      const service = await getDraftsServiceRef.current();
      try {
        return await service.saveCurrent(targetBrandId, nextPayload, {
          isKeepalive,
        });
      } catch (error) {
        if (isPermanentWriteFailure(error)) {
          throw new StudioPlaygroundDraftRejectedError(
            'The server rejected the draft',
          );
        }
        throw error;
      }
    },
    [],
  );

  // A different user signed in on this tab: whatever the previous user
  // queued is dropped, never sent under the new session.
  useEffect(() => {
    if (userId) {
      studioPlaygroundDraftOutbox.discardForeign(userId);
    }
  }, [userId]);

  // Stable on purpose: it reads everything through refs, so the brand-change
  // cleanup below never fires for an identity change alone.
  const flush = useCallback(
    (options: { isKeepalive?: boolean } = {}) => {
      const targetBrandId = armedBrandRef.current;
      if (!targetBrandId || !isAutosaveEnabledRef.current) {
        return;
      }
      studioPlaygroundDraftOutbox.enqueue(targetBrandId, payloadRef.current, {
        isKeepalive: options.isKeepalive,
        ownerId: userIdRef.current,
        write,
      });
    },
    [write],
  );

  // Restore once per brand. Autosave stays disarmed until the server's draft
  // is known, so a failed or half-applied load is never written back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt re-runs the load after a failure.
  useEffect(() => {
    if (!brandId || !canRestore || loadedBrandId === brandId) {
      return;
    }

    if (loadBaselineRef.current?.brandId !== brandId) {
      loadBaselineRef.current = {
        brandId,
        content: serializeDraftContent(payloadRef.current),
      };
      loadRetryAttemptRef.current = 0;
    }
    const contentAtStart = loadBaselineRef.current.content;
    const controller = new AbortController();
    let retryTimer: number | null = null;

    void (async () => {
      try {
        // A write the last page never got to send is replayed first, and any
        // queued or retrying write must land before the draft is read back,
        // or the read would restore the older content over it.
        const ownerId = userIdRef.current;
        const unsent = ownerId
          ? studioPlaygroundDraftOutbox.readUnsent(brandId, ownerId)
          : null;
        if (unsent) {
          studioPlaygroundDraftOutbox.enqueue(brandId, unsent, {
            ownerId,
            write,
          });
        }
        await studioPlaygroundDraftOutbox.whenIdle(brandId);
        const service = await getDraftsServiceRef.current();
        const draft = await service.getCurrent(brandId, controller.signal);
        if (controller.signal.aborted) {
          return;
        }

        // Typing before the draft arrived wins over the older saved draft.
        const isEditedWhileLoading =
          serializeDraftContent(payloadRef.current) !== contentAtStart;
        if (draft && !isRestoreBlockedRef.current && !isEditedWhileLoading) {
          const restoreBaseline = JSON.stringify(payloadRef.current);
          const unresolvedCount = await onRestoreRef.current(
            draft,
            controller.signal,
            () =>
              !controller.signal.aborted &&
              !isRestoreBlockedRef.current &&
              JSON.stringify(payloadRef.current) === restoreBaseline,
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
        // saved by the autosave below. With no draft, an untouched composer
        // is not worth creating one for.
        if (draft) {
          studioPlaygroundDraftOutbox.setAcknowledged(brandId, draft);
        } else if (!hasDraftContent(payloadRef.current)) {
          studioPlaygroundDraftOutbox.setAcknowledged(
            brandId,
            payloadRef.current,
          );
        }
        armedBrandRef.current = brandId;
        loadRetryAttemptRef.current = 0;
        setLoadedBrandId(brandId);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to restore the Studio composer draft', error);
        retryTimer = window.setTimeout(
          () => {
            setLoadAttempt((attempt) => attempt + 1);
          },
          Math.min(
            STUDIO_PLAYGROUND_DRAFT_LOAD_RETRY_BASE_MS *
              2 ** loadRetryAttemptRef.current,
            STUDIO_PLAYGROUND_DRAFT_LOAD_RETRY_MAX_MS,
          ),
        );
        loadRetryAttemptRef.current += 1;
      }
    })();

    return () => {
      controller.abort();
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [
    brandId,
    canRestore,
    loadAttempt,
    loadedBrandId,
    notificationsService,
    write,
  ]);

  useEffect(() => {
    if (!isArmed) {
      return;
    }
    return studioPlaygroundDraftOutbox.subscribe(brandId, setSaveStatus);
  }, [brandId, isArmed]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: payloadKey is the change signal; flush() reads the latest payload through a ref.
  useEffect(() => {
    if (!isArmed || !isAutosaveEnabled) {
      return;
    }

    const timer = window.setTimeout(() => {
      flush();
    }, STUDIO_PLAYGROUND_DRAFT_SAVE_DELAY_MS);

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
  // Generate — queues what was typed under that brand; the outbox finishes
  // it even if a write was still in flight and this workspace is gone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: brandId is the departure trigger.
  useEffect(() => {
    return () => {
      flush({ isKeepalive: true });
      armedBrandRef.current = null;
    };
  }, [brandId, flush]);

  return { isLoaded: isArmed, saveStatus: isArmed ? saveStatus : 'idle' };
}
