'use client';

import { AgentWorkObjectEditor } from '@genfeedai/agent/components/AgentWorkObjectEditor';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { useAgentWorkObjectGateStore } from '@genfeedai/agent/stores/agent-work-object-gate.store';
import type {
  AgentWorkObject,
  AgentWorkObjectActionPayload,
  AgentWorkObjectCollection,
} from '@genfeedai/contracts/interfaces';
import type { AgentWorkObjectsProps } from '@genfeedai/props/ui/agent/agent-work-objects.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

export function AgentWorkObjects({
  apiService,
  isReadOnly,
}: AgentWorkObjectsProps) {
  const translate = useTranslations('agent.workObjects');
  const { href } = useOrgUrl();
  const threadId = useAgentChatStore((state) => state.activeThreadId);
  const thread = useAgentChatStore((state) =>
    state.threads.find((item) => item.id === state.activeThreadId),
  );
  const messageCount = useAgentChatStore((state) => state.messages.length);
  const workEventVersion = useAgentChatStore((state) => {
    const event = state.workEvents.at(-1);
    return `${state.workEvents.length}:${event?.status ?? ''}:${event?.createdAt ?? ''}`;
  });
  const [collection, setCollection] =
    useState<AgentWorkObjectCollection | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const sessionRef = useRef({ threadId: '', id: '' });
  const activeThreadRef = useRef(threadId);
  activeThreadRef.current = threadId;
  const sequenceRef = useRef(0);
  const mutationCountsRef = useRef(new Map<string, number>());
  const loadedThreadRef = useRef<string | null>(null);

  const getSessionId = useCallback(function getSessionId(id: string) {
    if (sessionRef.current.threadId !== id) {
      const key = `agent-work-session:${id}`;
      let sessionId: string | null = null;
      try {
        sessionId = sessionStorage.getItem(key);
      } catch {}
      sessionId ??= crypto.randomUUID();
      try {
        sessionStorage.setItem(key, sessionId);
      } catch {}
      sessionRef.current = { threadId: id, id: sessionId };
    }
    return sessionRef.current.id;
  }, []);

  useEffect(() => {
    loadedThreadRef.current = null;
    setCollection(null);
    if (threadId)
      useAgentWorkObjectGateStore.getState().setObjects(threadId, null);
    setError(false);
  }, [threadId]);

  const reviewing =
    collection?.workObjects.some(
      (object) => object.reviewStatus === 'reviewing',
    ) ?? false;
  // biome-ignore lint/correctness/useExhaustiveDependencies: New thread messages, work events and explicit retries invalidate the session collection.
  useEffect(() => {
    if (!threadId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (!threadId || (mutationCountsRef.current.get(threadId) ?? 0) > 0)
        return;
      const sequence = ++sequenceRef.current;
      try {
        const result = await apiService.getWorkObjects(
          threadId,
          getSessionId(threadId),
          controller.signal,
        );
        if (!controller.signal.aborted && sequence === sequenceRef.current) {
          loadedThreadRef.current = threadId;
          setCollection(result);
          useAgentWorkObjectGateStore
            .getState()
            .setObjects(threadId, result.workObjects);
          setError(false);
        }
      } catch (caught) {
        if (caught instanceof Error && caught.name === 'AbortError') return;
        if (!controller.signal.aborted) setError(true);
      }
      if (reviewing && !controller.signal.aborted)
        timer = setTimeout(refresh, 1500);
    }
    void refresh();
    return function cleanup() {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [
    apiService,
    threadId,
    messageCount,
    workEventVersion,
    reviewing,
    retry,
    getSessionId,
  ]);

  const onAction = useCallback(
    async function onAction(
      object: AgentWorkObject,
      action: AgentWorkObjectActionPayload['action'],
      changes?: Pick<AgentWorkObjectActionPayload, 'body' | 'rows'>,
    ) {
      if (!threadId || isReadOnly) return;
      mutationCountsRef.current.set(
        threadId,
        (mutationCountsRef.current.get(threadId) ?? 0) + 1,
      );
      const sequence = ++sequenceRef.current;
      try {
        const result = await apiService.actOnWorkObject(threadId, object.id, {
          action,
          revision: object.revision,
          sessionId: getSessionId(threadId),
          brandId: thread?.brandId ?? undefined,
          expectedContextVersion: thread?.contextVersion,
          ...changes,
        });
        if (
          activeThreadRef.current === threadId &&
          sequence === sequenceRef.current
        ) {
          loadedThreadRef.current = threadId;
          setCollection(result);
          useAgentWorkObjectGateStore
            .getState()
            .setObjects(threadId, result.workObjects);
        }
      } finally {
        const remaining = Math.max(
          0,
          (mutationCountsRef.current.get(threadId) ?? 1) - 1,
        );
        mutationCountsRef.current.set(threadId, remaining);
        if (activeThreadRef.current === threadId && remaining === 0)
          setRetry((current) => current + 1);
      }
    },
    [
      apiService,
      threadId,
      thread?.brandId,
      thread?.contextVersion,
      isReadOnly,
      getSessionId,
    ],
  );

  if (error && !collection)
    return (
      <Button onClick={() => setRetry((current) => current + 1)}>
        {translate('retryLoad')}
      </Button>
    );
  if (!collection || loadedThreadRef.current !== threadId) return null;

  return (
    <>
      {collection.sessionAssets.length ? (
        <div
          role="group"
          aria-label={translate('sessionSources')}
          className="my-3 flex flex-wrap gap-2"
        >
          {collection.sessionAssets.map((asset) => (
            <Link
              key={asset.ingredientId}
              href={href(asset.href)}
              className="rounded-md border border-border px-2 py-1 text-xs text-foreground"
            >
              {asset.title} · {translate(asset.kind)}
              {asset.duration
                ? ` · ${Math.round(asset.duration)}s`
                : asset.width && asset.height
                  ? ` · ${asset.width} × ${asset.height}`
                  : ''}
            </Link>
          ))}
        </div>
      ) : null}
      {collection.workObjects.map((object) => (
        <AgentWorkObjectEditor
          key={object.id}
          threadId={threadId ?? undefined}
          object={object}
          libraryHref={href(object.href)}
          isReadOnly={isReadOnly}
          onAction={onAction}
        />
      ))}
    </>
  );
}
