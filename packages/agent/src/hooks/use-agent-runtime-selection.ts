'use client';

import { useDesktopLocalTools } from '@genfeedai/agent/hooks/use-desktop-local-tools';
import type {
  AgentRuntimeCatalog,
  AgentRuntimeOption,
} from '@genfeedai/agent/models/agent-runtime.model';
import type {
  AgentApiService,
  AgentInstallReadiness,
} from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  buildAgentRuntimeCatalog,
  isDesktopCliRuntimeKey,
  resolveThreadRuntimeOption,
} from '@genfeedai/agent/utils/agent-runtime-options.util';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface AgentRuntimeSelection {
  catalog: AgentRuntimeCatalog;
  /** True when a local Claude Code / Codex runtime can run on this desktop. */
  hasDesktopCliRuntimes: boolean;
  onRuntimeChange: (runtime: AgentRuntimeOption) => void;
  selectedRuntime: AgentRuntimeOption;
}

/**
 * Runtime routing for the active thread (or the next new thread): builds the
 * catalog, resolves the selection, and persists changes on the thread.
 */
export function useAgentRuntimeSelection(params: {
  apiService: AgentApiService;
  isActive?: boolean;
}): AgentRuntimeSelection {
  const { apiService, isActive = true } = params;
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const threads = useAgentChatStore((s) => s.threads);
  const updateThread = useAgentChatStore((s) => s.updateThread);
  const draftRuntimeKey = useAgentChatStore((s) => s.draftRuntimeKey);
  const setDraftRuntimeKey = useAgentChatStore((s) => s.setDraftRuntimeKey);
  const desktopTools = useDesktopLocalTools();
  const [installReadiness, setInstallReadiness] =
    useState<AgentInstallReadiness | null>(null);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const controller = new AbortController();

    apiService
      .getInstallReadiness(controller.signal)
      .then((readiness) => {
        if (!controller.signal.aborted) {
          setInstallReadiness(readiness);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setInstallReadiness(null);
        }
      });

    return () => controller.abort();
  }, [apiService, isActive]);

  const catalog = useMemo(
    () =>
      buildAgentRuntimeCatalog({
        desktopTools,
        readiness: installReadiness,
      }),
    [desktopTools, installReadiness],
  );

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );

  const draftRuntime = useMemo(
    () =>
      draftRuntimeKey
        ? (catalog.options.find((option) => option.key === draftRuntimeKey) ??
          null)
        : null,
    [catalog, draftRuntimeKey],
  );

  const selectedRuntime = useMemo(() => {
    if (!activeThreadId && draftRuntime) {
      return draftRuntime;
    }

    return resolveThreadRuntimeOption({ catalog, thread: activeThread });
  }, [activeThread, activeThreadId, catalog, draftRuntime]);

  // A runtime picked before the thread existed applies once it is created.
  useEffect(() => {
    if (!activeThreadId || !draftRuntime) {
      return;
    }

    const currentThread = threads.find(
      (thread) => thread.id === activeThreadId,
    );
    if (
      currentThread?.runtimeKey === draftRuntime.key &&
      (currentThread?.requestedModel || '') === draftRuntime.requestedModel
    ) {
      setDraftRuntimeKey(null);
      return;
    }

    updateThread(activeThreadId, {
      requestedModel: draftRuntime.requestedModel || undefined,
      runtimeKey: draftRuntime.key || undefined,
    });

    const controller = new AbortController();
    apiService
      .updateThread(
        activeThreadId,
        // Empty strings clear a previous runtime server-side.
        {
          requestedModel: draftRuntime.requestedModel,
          runtimeKey: draftRuntime.key,
        },
        controller.signal,
      )
      .then(() => {
        if (!controller.signal.aborted) {
          setDraftRuntimeKey(null);
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [
    activeThreadId,
    apiService,
    draftRuntime,
    setDraftRuntimeKey,
    threads,
    updateThread,
  ]);

  const onRuntimeChange = useCallback(
    (runtime: AgentRuntimeOption) => {
      if (!activeThreadId) {
        setDraftRuntimeKey(runtime.key || null);
        return;
      }

      updateThread(activeThreadId, {
        requestedModel: runtime.requestedModel || undefined,
        runtimeKey: runtime.key || undefined,
      });

      const controller = new AbortController();
      void apiService
        .updateThread(
          activeThreadId,
          // Empty strings clear a previous runtime server-side.
          {
            requestedModel: runtime.requestedModel,
            runtimeKey: runtime.key,
          },
          controller.signal,
        )
        .catch(() => undefined);
    },
    [activeThreadId, apiService, setDraftRuntimeKey, updateThread],
  );

  return {
    catalog,
    hasDesktopCliRuntimes: catalog.options.some((option) =>
      isDesktopCliRuntimeKey(option.key),
    ),
    onRuntimeChange,
    selectedRuntime,
  };
}
