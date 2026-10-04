'use client';

import type { SendStreamMessageOptions } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { useDesktopLocalTools } from '@genfeedai/agent/hooks/use-desktop-local-tools';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { selectActiveRun } from '@genfeedai/agent/stores/agent-chat.store.run';
import {
  DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE,
  getDesktopCliRuntimeOption,
  resolveDesktopCliRuntimeBlocker,
  resolveDesktopCliRuntimeKey,
  resolveWebCliRuntimeKey,
} from '@genfeedai/agent/utils/agent-runtime-options.util';
import { getGenfeedDesktopBridge } from '@genfeedai/agent/utils/desktop-bridge.util';
import {
  type DesktopCliAgentTurnHandleRef,
  runDesktopCliAgentTurn,
} from '@genfeedai/agent/utils/desktop-cli-agent-turn.util';
import type { AgentExternalRuntimeKey } from '@genfeedai/contracts/constants';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';

export interface DesktopCliAgentChat {
  /**
   * Why the bound local runtime cannot take a turn right now (CLI still being
   * detected, missing, or too old; or, outside Desktop, a thread bound to a
   * CLI the browser cannot run), or null. Sends are refused while it is set,
   * keeping the draft; they never fall back to the hosted runtime.
   */
  blockedReason: string | null;
  /**
   * Stops the local turn of the visible thread. Returns false when none is
   * running there, so Stop falls through to the visible hosted run.
   */
  cancelActiveTurn: () => boolean;
  /**
   * True when the visible thread (or the draft) is bound to a local CLI
   * runtime, whether or not that CLI can run right now. Outside Desktop it
   * routes every send through the blocker, so no path (follow-up, retry,
   * suggested prompt) reaches the hosted stream.
   */
  isEnabled: boolean;
  runtimeKey: AgentExternalRuntimeKey | null;
  sendMessage: (
    content: string,
    options?: SendStreamMessageOptions,
  ) => Promise<void>;
}

/**
 * Transport for threads whose runtime is `local/claude-cli` or
 * `local/codex-cli`: turns run in Genfeed Desktop on the user's own CLI
 * subscription instead of the hosted agent API stream.
 */
export function useDesktopCliAgentChat(): DesktopCliAgentChat {
  const { isResolved: isDetectionResolved, tools: desktopTools } =
    useDesktopLocalTools();
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const activeThreadRuntimeKey = useAgentChatStore(
    (s) =>
      s.threads.find((thread) => thread.id === s.activeThreadId)?.runtimeKey,
  );
  const draftRuntimeKey = useAgentChatStore((s) => s.draftRuntimeKey);
  const activeTurnRef: DesktopCliAgentTurnHandleRef = useRef(null);

  const translate = useTranslations('agent.localCliRuntime');
  const hasDesktopBridge = getGenfeedDesktopBridge() !== null;
  const bindingParams = {
    activeThreadId,
    draftRuntimeKey,
    hasDesktopBridge,
    thread: { runtimeKey: activeThreadRuntimeKey },
  };
  const runtimeKey = resolveDesktopCliRuntimeKey(bindingParams);
  // The plain web app cannot run a local CLI: the bound thread is blocked
  // instead of silently reaching the credit-billed hosted stream.
  const webRuntimeKey = resolveWebCliRuntimeKey(bindingParams);

  // Until detection finishes the runtime cannot be vouched for: refuse the
  // send (the draft stays) rather than wait and dispatch later, when the
  // visible thread may have changed.
  const desktopBlockedReason = !runtimeKey
    ? null
    : isDetectionResolved
      ? resolveDesktopCliRuntimeBlocker(runtimeKey, desktopTools)
      : DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE;
  const blockedReason = webRuntimeKey
    ? translate('webBlocked', {
        runtime: getDesktopCliRuntimeOption(webRuntimeKey).label,
      })
    : desktopBlockedReason;

  const sendMessage = useCallback(
    async (content: string, options?: SendStreamMessageOptions) => {
      if (blockedReason) {
        useAgentChatStore.getState().setError(blockedReason);
        return;
      }

      const bridge = getGenfeedDesktopBridge();
      if (!bridge || !runtimeKey) {
        useAgentChatStore
          .getState()
          .setError(
            'Local CLI runtimes are only available in Genfeed Desktop.',
          );
        return;
      }

      await runDesktopCliAgentTurn({
        activeTurnRef,
        bridge,
        content,
        options,
        runtimeKey,
      });
    },
    [blockedReason, runtimeKey],
  );

  const cancelActiveTurn = useCallback((): boolean => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) {
      return false;
    }

    const visibleState = useAgentChatStore.getState();
    const visibleThreadId = visibleState.activeThreadId;
    if (
      selectActiveRun(visibleState).runId !== activeTurn.runId &&
      visibleThreadId !== activeTurn.threadId
    ) {
      return false;
    }

    void activeTurn.bridge.agentRuntime
      .cancelTurn(activeTurn.turnId)
      .catch(() => undefined);
    return true;
  }, []);

  return {
    blockedReason,
    cancelActiveTurn,
    isEnabled: runtimeKey !== null || webRuntimeKey !== null,
    runtimeKey,
    sendMessage,
  };
}
