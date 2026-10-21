'use client';

import {
  type AgentThreadUpdateFailure,
  useAgentThreadUpdate,
} from '@genfeedai/agent/hooks/use-agent-thread-update';
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
  getDesktopCliRuntimeOption,
  HOSTED_GENFEED_RUNTIME_OPTION,
  isDesktopCliRuntimeKey,
  resolveDesktopCliRuntimeBlocker,
  resolveThreadRuntimeOption,
  resolveWebCliRuntimeKey,
} from '@genfeedai/agent/utils/agent-runtime-options.util';
import { getGenfeedDesktopBridge } from '@genfeedai/agent/utils/desktop-bridge.util';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface AgentRuntimeSelection {
  catalog: AgentRuntimeCatalog;
  updateFailure: AgentThreadUpdateFailure | null;
  /** True when a local Claude Code / Codex runtime can run on this desktop. */
  hasDesktopCliRuntimes: boolean;
  onRuntimeChange: (runtime: AgentRuntimeOption) => void;
  /**
   * What the composer must say about local CLIs: why the selected local
   * runtime cannot run, else which installed CLI needs an update.
   */
  runtimeNotice: string | null;
  selectedRuntime: AgentRuntimeOption;
  /**
   * Moves the thread (or the draft) to the credit-billed Genfeed runtime,
   * through the same persistence as any runtime change.
   */
  switchToHosted: () => void;
  /**
   * The local CLI runtime the thread (or draft) is bound to when this is not
   * Desktop, where it cannot run and sends are blocked, else null.
   */
  webBlockedRuntime: AgentRuntimeOption | null;
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
  const { failure: updateFailure, runUpdate } = useAgentThreadUpdate();
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const threads = useAgentChatStore((s) => s.threads);
  const updateThread = useAgentChatStore((s) => s.updateThread);
  const draftRuntimeKey = useAgentChatStore((s) => s.draftRuntimeKey);
  const setDraftRuntimeKey = useAgentChatStore((s) => s.setDraftRuntimeKey);
  const { tools: desktopTools } = useDesktopLocalTools();
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
          (isDesktopCliRuntimeKey(draftRuntimeKey)
            ? getDesktopCliRuntimeOption(draftRuntimeKey)
            : null))
        : null,
    [catalog, draftRuntimeKey],
  );

  const selectedRuntime = useMemo(() => {
    if (!activeThreadId && draftRuntime) {
      return draftRuntime;
    }

    return resolveThreadRuntimeOption({ catalog, thread: activeThread });
  }, [activeThread, activeThreadId, catalog, draftRuntime]);

  const draftKeyToPersist = draftRuntime?.key;
  const draftModelToPersist = draftRuntime?.requestedModel;
  const confirmedRuntimeKey = activeThread?.runtimeKey;
  const confirmedRequestedModel = activeThread?.requestedModel;

  // A failed application waits for an explicit runtime choice, even if the
  // thread list refreshes while the deleted conversation remains selected.
  // A runtime picked before the thread existed applies once it is created.
  useEffect(() => {
    if (!activeThreadId || draftKeyToPersist === undefined || updateFailure) {
      return;
    }

    if (
      confirmedRuntimeKey === draftKeyToPersist &&
      (confirmedRequestedModel || '') === draftModelToPersist
    ) {
      setDraftRuntimeKey(null);
      return;
    }

    const controller = new AbortController();
    void runUpdate(
      activeThreadId,
      (signal) =>
        apiService.updateThread(
          activeThreadId,
          {
            requestedModel: draftModelToPersist,
            runtimeKey: draftKeyToPersist,
          },
          signal,
        ),
      { signal: controller.signal },
    ).then((updated) => {
      if (updated && !controller.signal.aborted) {
        updateThread(activeThreadId, updated);
        setDraftRuntimeKey(null);
      }
    });

    return () => controller.abort();
  }, [
    activeThreadId,
    apiService,
    draftKeyToPersist,
    draftModelToPersist,
    confirmedRuntimeKey,
    confirmedRequestedModel,
    runUpdate,
    setDraftRuntimeKey,
    updateFailure,
    updateThread,
  ]);

  const onRuntimeChange = useCallback(
    (runtime: AgentRuntimeOption) => {
      if (!activeThreadId) {
        setDraftRuntimeKey(runtime.key || null);
        return;
      }

      setDraftRuntimeKey(null);
      void runUpdate(activeThreadId, (signal) =>
        apiService.updateThread(
          activeThreadId,
          {
            requestedModel: runtime.requestedModel,
            runtimeKey: runtime.key,
          },
          signal,
        ),
      ).then((updated) => {
        if (updated) updateThread(activeThreadId, updated);
      });
    },
    [activeThreadId, apiService, runUpdate, setDraftRuntimeKey, updateThread],
  );

  const switchToHosted = useCallback(
    () => onRuntimeChange(HOSTED_GENFEED_RUNTIME_OPTION),
    [onRuntimeChange],
  );

  const webBlockedRuntimeKey = resolveWebCliRuntimeKey({
    activeThreadId,
    draftRuntimeKey,
    hasDesktopBridge: getGenfeedDesktopBridge() !== null,
    thread: activeThread,
  });

  const selectedRuntimeBlocker =
    desktopTools && isDesktopCliRuntimeKey(selectedRuntime.key)
      ? resolveDesktopCliRuntimeBlocker(selectedRuntime.key, desktopTools)
      : null;

  return {
    catalog,
    updateFailure,
    hasDesktopCliRuntimes: catalog.options.some((option) =>
      isDesktopCliRuntimeKey(option.key),
    ),
    onRuntimeChange,
    runtimeNotice: selectedRuntimeBlocker ?? catalog.localToolNotice,
    selectedRuntime,
    switchToHosted,
    webBlockedRuntime: webBlockedRuntimeKey
      ? getDesktopCliRuntimeOption(webBlockedRuntimeKey)
      : null,
  };
}
