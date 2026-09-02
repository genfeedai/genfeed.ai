'use client';

import type {
  IPaginatedResponse,
  SocialInboxQuery,
} from '@genfeedai/contracts/interfaces';
import type { SocialConversationModel } from '@genfeedai/models/social/social-conversation.model';
import type { SocialMessageModel } from '@genfeedai/models/social/social-message.model';
import type { SocialMessagesService } from '@services/social/messages.service';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  EMPTY_MESSAGES_PAGINATION,
  getMessagesErrorMessage,
  isAbortLike,
  type MessagesPaginationState,
} from './messages-page.helpers';
import { useMessagesRealtime } from './use-messages-realtime';

export interface UseMessagesConversationsParams {
  readonly getMessagesService: () => Promise<SocialMessagesService>;
  readonly onClearSelectedConversationParam: () => void;
  readonly query: SocialInboxQuery;
  readonly requestedConversationId: string | null;
  readonly scopedOrganizationId?: string;
}

export function useMessagesConversations({
  getMessagesService,
  onClearSelectedConversationParam,
  query,
  requestedConversationId,
  scopedOrganizationId,
}: UseMessagesConversationsParams) {
  const [conversations, setConversations] = useState<SocialConversationModel[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversationPagination, setConversationPagination] =
    useState<MessagesPaginationState>(EMPTY_MESSAGES_PAGINATION);
  const [messages, setMessages] = useState<SocialMessageModel[]>([]);
  const [messagePage, setMessagePage] = useState(1);
  const [messagePagination, setMessagePagination] =
    useState<MessagesPaginationState>(EMPTY_MESSAGES_PAGINATION);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadConversations = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoadingConversations(true);
      setLoadError(null);

      try {
        const service = await getMessagesService();
        const result = await service.listPage(query, signal);
        if (signal?.aborted) {
          return;
        }

        const { items, ...pagination } = result;
        let nextConversations = items;

        if (
          requestedConversationId &&
          !items.some(
            (conversation) => conversation.id === requestedConversationId,
          )
        ) {
          try {
            const requestedConversation = await service.getConversation(
              requestedConversationId,
              signal,
            );
            nextConversations = [requestedConversation, ...items];
          } catch (selectionError: unknown) {
            if (isAbortLike(selectionError)) {
              return;
            }

            onClearSelectedConversationParam();
          }
        }

        if (signal?.aborted) {
          return;
        }

        setConversations(nextConversations);
        setConversationPagination(pagination);
        setSelectedId((current) => {
          if (
            requestedConversationId &&
            nextConversations.some(
              (conversation) => conversation.id === requestedConversationId,
            )
          ) {
            return requestedConversationId;
          }

          if (
            current &&
            nextConversations.some(
              (conversation) => conversation.id === current,
            )
          ) {
            return current;
          }

          return nextConversations[0]?.id ?? null;
        });
      } catch (err: unknown) {
        if (!isAbortLike(err)) {
          setLoadError(getMessagesErrorMessage(err));
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoadingConversations(false);
        }
      }
    },
    [
      getMessagesService,
      onClearSelectedConversationParam,
      query,
      requestedConversationId,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadConversations(controller.signal);
    return () => controller.abort();
  }, [loadConversations]);

  // Reset thread pagination when the selected conversation changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedId is the intentional trigger; body only resets page.
  useEffect(() => {
    setMessagePage(1);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    const controller = new AbortController();
    setIsLoadingMessages(true);
    setLoadError(null);

    getMessagesService()
      .then((service) =>
        service.listMessagesPage(
          selectedId,
          { limit: 50, page: messagePage },
          controller.signal,
        ),
      )
      .then((result: IPaginatedResponse<SocialMessageModel>) => {
        if (!controller.signal.aborted) {
          const { items: nextMessages, ...pagination } = result;
          setMessages(nextMessages);
          setMessagePagination(pagination);
        }
      })
      .catch((err: unknown) => {
        if (!isAbortLike(err)) {
          setLoadError(getMessagesErrorMessage(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingMessages(false);
        }
      });

    return () => controller.abort();
  }, [getMessagesService, messagePage, selectedId]);

  const refreshSelectedThread = useCallback(async () => {
    const service = await getMessagesService();
    const [conversationResult, selectedConversationResult, messageResult] =
      await Promise.all([
        service.listPage(query),
        selectedId
          ? service.getConversation(selectedId)
          : Promise.resolve(null),
        selectedId
          ? service.listMessagesPage(selectedId, {
              limit: 50,
              page: messagePage,
            })
          : Promise.resolve(null),
      ]);
    const { items: nextConversations, ...nextConversationPagination } =
      conversationResult;
    const refreshedConversations = selectedConversationResult
      ? [
          selectedConversationResult,
          ...nextConversations.filter(
            (conversation) => conversation.id !== selectedConversationResult.id,
          ),
        ]
      : nextConversations;

    startTransition(() => {
      setConversations(refreshedConversations);
      setConversationPagination(nextConversationPagination);
      if (messageResult) {
        const { items: nextMessages, ...nextMessagePagination } = messageResult;
        setMessages(nextMessages);
        setMessagePagination(nextMessagePagination);
      }
    });
  }, [getMessagesService, messagePage, query, selectedId]);

  const selectedConversation = useMemo(
    () =>
      selectedId
        ? (conversations.find(
            (conversation) => conversation.id === selectedId,
          ) ?? null)
        : null,
    [conversations, selectedId],
  );

  const organizationId =
    scopedOrganizationId ||
    selectedConversation?.organizationId ||
    conversations[0]?.organizationId;

  const connectionState = useMessagesRealtime({
    onRefresh: refreshSelectedThread,
    organizationId,
  });

  return {
    connectionState,
    conversationPagination,
    conversations,
    isLoadingConversations,
    isLoadingMessages,
    loadConversations,
    loadError,
    messagePage,
    messagePagination,
    messages,
    organizationId,
    refreshSelectedThread,
    selectedConversation,
    selectedId,
    setLoadError,
    setMessagePage,
    setSelectedId,
  };
}
