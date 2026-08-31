'use client';

import { SocialConversationType } from '@genfeedai/enums';
import type {
  SocialConversationStatus,
  SocialInboxReference,
} from '@genfeedai/interfaces';
import type { SocialConversationModel } from '@genfeedai/models/social/social-conversation.model';
import type { SocialMessageModel } from '@genfeedai/models/social/social-message.model';
import type { SocialMessagesService } from '@services/social/messages.service';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MessagesSurface } from './messages-conversation-sidebar';
import {
  getMessagesErrorMessage,
  getMessagesSyncFeedback,
  type MessagesBusyAction,
  type MessagesSyncJob,
  STATUS_LABELS,
  settleMessagesSyncJobs,
} from './messages-page.helpers';
import {
  createMessagesIdempotencyKey,
  createSocialConversationReference,
  createSocialMessageReference,
  getSocialInboxReferenceKey,
  type MessagesActionKind,
  toggleSocialInboxReference,
} from './messages-surface.helpers';
import { captureMessagesSurfaceEvent } from './messages-surface-telemetry';

export interface UseMessagesActionsParams {
  readonly canAttachReferences: boolean;
  /** Which inbox surface is open — decides what a sync actually sweeps. */
  readonly conversationType: MessagesSurface;
  readonly getMessagesService: () => Promise<SocialMessagesService>;
  readonly loadConversations: (signal?: AbortSignal) => Promise<void>;
  readonly onLoadError?: (message: string | null) => void;
  readonly refreshSelectedThread: () => Promise<void>;
  readonly selectedConversation: SocialConversationModel | null;
  readonly selectedId: string | null;
}

export function useMessagesActions({
  canAttachReferences,
  conversationType,
  getMessagesService,
  loadConversations,
  onLoadError,
  refreshSelectedThread,
  selectedConversation,
  selectedId,
}: UseMessagesActionsParams) {
  const [draft, setDraft] = useState('');
  const [references, setReferences] = useState<SocialInboxReference[]>([]);
  const [busyAction, setBusyAction] = useState<MessagesBusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const actionInFlightRef = useRef<string | null>(null);
  const draftRevisionRef = useRef(1);
  const pendingIdempotencyKeysRef = useRef(new Map<string, string>());

  useEffect(() => {
    setReferences((current) =>
      current.filter((reference) => reference.conversationId === selectedId),
    );
  }, [selectedId]);

  useEffect(() => {
    if (!canAttachReferences) {
      setReferences([]);
    }
  }, [canAttachReferences]);

  const refreshAfterAction = useCallback(async () => {
    try {
      await refreshSelectedThread();
    } catch {
      setNotice(
        (current) =>
          `${current ?? 'Action completed.'} Realtime refresh will reconcile the inbox.`,
      );
      captureMessagesSurfaceEvent({
        action: 'realtime-refresh',
        outcome: 'failed',
      });
    }
  }, [refreshSelectedThread]);

  const handleDraftChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      draftRevisionRef.current += 1;
      pendingIdempotencyKeysRef.current.clear();
      setDraft(event.target.value);
    },
    [],
  );

  const handleAction = useCallback(
    async (action: 'draft' | 'dm' | 'reply') => {
      if (!selectedId || !draft.trim()) {
        return;
      }

      const actionKey = `${action}:${selectedId}`;
      if (actionInFlightRef.current) {
        captureMessagesSurfaceEvent({
          action,
          outcome: 'blocked',
        });
        return;
      }
      actionInFlightRef.current = actionKey;

      setBusyAction(action);
      setError(null);
      onLoadError?.(null);
      setNotice(null);
      captureMessagesSurfaceEvent({ action, outcome: 'started' });

      try {
        const service = await getMessagesService();
        const idempotencyCacheKey = `${selectedId}:${action}:${draftRevisionRef.current}`;
        const idempotencyKey =
          pendingIdempotencyKeysRef.current.get(idempotencyCacheKey) ??
          createMessagesIdempotencyKey(
            selectedId,
            action,
            draftRevisionRef.current,
          );
        pendingIdempotencyKeysRef.current.set(
          idempotencyCacheKey,
          idempotencyKey,
        );
        const input = { idempotencyKey, text: draft.trim() };

        if (action === 'draft') {
          await service.createDraft(selectedId, {
            ...input,
            messageType: 'reply',
          });
          setNotice('Draft saved for review.');
        } else if (action === 'reply') {
          await service.postReply(selectedId, input);
          setNotice('Reply posted.');
        } else {
          await service.sendDm(selectedId, input);
          setNotice('DM sent.');
        }

        setDraft('');
        draftRevisionRef.current += 1;
        pendingIdempotencyKeysRef.current.delete(idempotencyCacheKey);
        await refreshAfterAction();
        captureMessagesSurfaceEvent({ action, outcome: 'succeeded' });
      } catch (err: unknown) {
        setError(getMessagesErrorMessage(err));
        captureMessagesSurfaceEvent({ action, outcome: 'failed' });
      } finally {
        if (actionInFlightRef.current === actionKey) {
          actionInFlightRef.current = null;
        }
        setBusyAction(null);
      }
    },
    [draft, getMessagesService, onLoadError, refreshAfterAction, selectedId],
  );

  const handleStatusChange = useCallback(
    async (nextStatus: SocialConversationStatus) => {
      if (!selectedId) {
        return;
      }

      const action: MessagesActionKind = 'status';
      const actionKey = `${action}:${selectedId}`;
      if (actionInFlightRef.current) {
        captureMessagesSurfaceEvent({ action, outcome: 'blocked' });
        return;
      }
      actionInFlightRef.current = actionKey;

      setBusyAction('status');
      setError(null);
      onLoadError?.(null);
      setNotice(null);
      captureMessagesSurfaceEvent({ action, outcome: 'started' });

      try {
        const service = await getMessagesService();
        await service.updateStatus(selectedId, nextStatus);
        setNotice(
          `Conversation marked ${STATUS_LABELS[nextStatus] ?? nextStatus}.`,
        );
        await loadConversations();
        captureMessagesSurfaceEvent({ action, outcome: 'succeeded' });
      } catch (err: unknown) {
        setError(getMessagesErrorMessage(err));
        captureMessagesSurfaceEvent({ action, outcome: 'failed' });
      } finally {
        if (actionInFlightRef.current === actionKey) {
          actionInFlightRef.current = null;
        }
        setBusyAction(null);
      }
    },
    [getMessagesService, loadConversations, onLoadError, selectedId],
  );

  const handleSync = useCallback(async () => {
    const action: MessagesActionKind = 'sync';
    if (actionInFlightRef.current) {
      captureMessagesSurfaceEvent({ action, outcome: 'blocked' });
      return;
    }
    actionInFlightRef.current = action;
    setBusyAction('sync');
    setError(null);
    onLoadError?.(null);
    setNotice(null);
    captureMessagesSurfaceEvent({ action, outcome: 'started' });

    try {
      const service = await getMessagesService();
      const isDirectMessage = conversationType === SocialConversationType.DM;
      // One rejected enqueue must not hide the rest: a brand often has only
      // some platforms connected, and the other jobs are already queued.
      const directMessageJobs: MessagesSyncJob[] = [
        { platform: 'Instagram', run: () => service.syncInstagramDms() },
        { platform: 'X', run: () => service.syncXDms() },
        { platform: 'LinkedIn', run: () => service.syncLinkedInDms() },
      ];
      const commentJobs: MessagesSyncJob[] = [
        { platform: 'YouTube', run: () => service.syncYoutube() },
        { platform: 'Instagram', run: () => service.syncInstagram() },
        { platform: 'X', run: () => service.syncX() },
        { platform: 'LinkedIn', run: () => service.syncLinkedIn() },
      ];
      const jobs: MessagesSyncJob[] = isDirectMessage
        ? directMessageJobs
        : conversationType === SocialConversationType.COMMENT
          ? commentJobs
          : [...commentJobs, ...directMessageJobs];
      const outcome = await settleMessagesSyncJobs(jobs);
      await loadConversations();
      const feedback = getMessagesSyncFeedback({
        failedPlatforms: outcome.failedPlatforms,
        hasSuccess: outcome.hasSuccess,
        scope: isDirectMessage
          ? 'dms'
          : conversationType === SocialConversationType.COMMENT
            ? 'comments'
            : 'all',
      });
      setError(feedback.error);
      setNotice(feedback.notice);
      captureMessagesSurfaceEvent({
        action,
        outcome: outcome.hasSuccess ? 'succeeded' : 'failed',
      });
    } catch (err: unknown) {
      setError(getMessagesErrorMessage(err));
      captureMessagesSurfaceEvent({ action, outcome: 'failed' });
    } finally {
      if (actionInFlightRef.current === action) {
        actionInFlightRef.current = null;
      }
      setBusyAction(null);
    }
  }, [conversationType, getMessagesService, loadConversations, onLoadError]);

  const handleApproveDraft = useCallback(
    async (messageId: string) => {
      if (!selectedId) {
        return;
      }

      const action: MessagesActionKind = 'approve';
      const actionKey = `${action}:${messageId}`;
      if (actionInFlightRef.current) {
        captureMessagesSurfaceEvent({ action, outcome: 'blocked' });
        return;
      }
      actionInFlightRef.current = actionKey;

      setBusyAction(`approve:${messageId}`);
      setError(null);
      onLoadError?.(null);
      setNotice(null);
      captureMessagesSurfaceEvent({ action, outcome: 'started' });

      try {
        const service = await getMessagesService();
        await service.approveDraft(selectedId, messageId);
        setNotice('Draft approved and published.');
        await refreshAfterAction();
        captureMessagesSurfaceEvent({ action, outcome: 'succeeded' });
      } catch (err: unknown) {
        setError(getMessagesErrorMessage(err));
        captureMessagesSurfaceEvent({ action, outcome: 'failed' });
      } finally {
        if (actionInFlightRef.current === actionKey) {
          actionInFlightRef.current = null;
        }
        setBusyAction(null);
      }
    },
    [getMessagesService, onLoadError, refreshAfterAction, selectedId],
  );

  const handleRejectDraft = useCallback(
    async (messageId: string) => {
      if (!selectedId) {
        return;
      }

      const action: MessagesActionKind = 'reject';
      const actionKey = `${action}:${messageId}`;
      if (actionInFlightRef.current) {
        captureMessagesSurfaceEvent({ action, outcome: 'blocked' });
        return;
      }
      actionInFlightRef.current = actionKey;

      setBusyAction(`reject:${messageId}`);
      setError(null);
      onLoadError?.(null);
      setNotice(null);
      captureMessagesSurfaceEvent({ action, outcome: 'started' });

      try {
        const service = await getMessagesService();
        await service.rejectDraft(selectedId, messageId);
        setNotice('Draft rejected.');
        await refreshAfterAction();
        captureMessagesSurfaceEvent({ action, outcome: 'succeeded' });
      } catch (err: unknown) {
        setError(getMessagesErrorMessage(err));
        captureMessagesSurfaceEvent({ action, outcome: 'failed' });
      } finally {
        if (actionInFlightRef.current === actionKey) {
          actionInFlightRef.current = null;
        }
        setBusyAction(null);
      }
    },
    [getMessagesService, onLoadError, refreshAfterAction, selectedId],
  );

  const conversationReference = useMemo(
    () =>
      selectedConversation
        ? createSocialConversationReference(selectedConversation)
        : null,
    [selectedConversation],
  );

  const isConversationReferenced = Boolean(
    conversationReference &&
      references.some(
        (reference) =>
          getSocialInboxReferenceKey(reference) ===
          getSocialInboxReferenceKey(conversationReference),
      ),
  );

  const handleToggleConversationReference = useCallback(() => {
    if (!canAttachReferences || !conversationReference) {
      captureMessagesSurfaceEvent({
        action: 'attach-reference',
        outcome: 'blocked',
        referenceKind: 'social-conversation',
      });
      return;
    }

    setReferences((current) =>
      toggleSocialInboxReference(current, conversationReference),
    );
    captureMessagesSurfaceEvent({
      action: 'attach-reference',
      outcome: 'succeeded',
      referenceKind: 'social-conversation',
    });
  }, [canAttachReferences, conversationReference]);

  const handleToggleMessageReference = useCallback(
    (message: SocialMessageModel) => {
      if (!canAttachReferences || !selectedConversation) {
        captureMessagesSurfaceEvent({
          action: 'attach-reference',
          outcome: 'blocked',
          referenceKind: 'social-message',
        });
        return;
      }

      const reference = createSocialMessageReference(
        selectedConversation,
        message,
      );
      if (!reference) {
        captureMessagesSurfaceEvent({
          action: 'attach-reference',
          outcome: 'blocked',
          referenceKind: 'social-message',
        });
        return;
      }

      setReferences((current) =>
        toggleSocialInboxReference(current, reference),
      );
      captureMessagesSurfaceEvent({
        action: 'attach-reference',
        outcome: 'succeeded',
        referenceKind: 'social-message',
      });
    },
    [canAttachReferences, selectedConversation],
  );

  const isMessageReferenced = useCallback(
    (message: SocialMessageModel) =>
      references.some(
        (reference) =>
          reference.kind === 'social-message' &&
          reference.messageId === message.id,
      ),
    [references],
  );

  return {
    busyAction,
    draft,
    error,
    handleAction,
    handleApproveDraft,
    handleDraftChange,
    handleRejectDraft,
    handleStatusChange,
    handleSync,
    handleToggleConversationReference,
    handleToggleMessageReference,
    isConversationReferenced,
    isMessageReferenced,
    notice,
    references,
    setError,
  };
}
