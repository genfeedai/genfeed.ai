'use client';

import type { SendStreamMessageOptions } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { useDesktopLocalTools } from '@genfeedai/agent/hooks/use-desktop-local-tools';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE,
  resolveDesktopCliRuntimeBlocker,
  resolveDesktopCliRuntimeKey,
} from '@genfeedai/agent/utils/agent-runtime-options.util';
import { getGenfeedDesktopBridge } from '@genfeedai/agent/utils/desktop-bridge.util';
import {
  type DesktopCliAgentTurnHandleRef,
  runDesktopCliAgentTurn,
} from '@genfeedai/agent/utils/desktop-cli-agent-turn.util';
import type { AgentExternalRuntimeKey } from '@genfeedai/contracts/constants';
import { useCallback, useRef } from 'react';

export interface DesktopCliAgentChat {
  /**
   * Why the bound local runtime cannot take a turn right now (CLI still being
   * detected, missing, or too old), or null. Sends are refused while it is
   * set, keeping the draft; they never fall back to the hosted runtime.
   */
  blockedReason: string | null;
  /**
   * Stops the local turn of the visible thread. Returns false when none is
   * running there, so Stop falls through to the visible hosted run.
   */
  cancelActiveTurn: () => boolean;
  /**
   * True when the visible thread (or the draft) is bound to a local CLI
   * runtime in Desktop, whether or not that CLI can run right now.
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

  const runtimeKey = resolveDesktopCliRuntimeKey({
    activeThreadId,
    draftRuntimeKey,
    hasDesktopBridge: getGenfeedDesktopBridge() !== null,
    thread: { runtimeKey: activeThreadRuntimeKey },
  });

  // Until detection finishes the runtime cannot be vouched for: refuse the
  // send (the draft stays) rather than wait and dispatch later, when the
  // visible thread may have changed.
  const blockedReason = !runtimeKey
    ? null
    : isDetectionResolved
      ? resolveDesktopCliRuntimeBlocker(runtimeKey, desktopTools)
      : DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE;

  const sendMessage = useCallback(
    async (content: string, options?: SendStreamMessageOptions) => {
      const bridge = getGenfeedDesktopBridge();
      if (!bridge || !runtimeKey) {
        useAgentChatStore
          .getState()
          .setError(
            'Local CLI runtimes are only available in Genfeed Desktop.',
          );
        return;
      }

      if (blockedReason) {
        useAgentChatStore.getState().setError(blockedReason);
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

    const { activeRunId, activeThreadId: visibleThreadId } =
      useAgentChatStore.getState();
    if (
      activeRunId !== activeTurn.runId &&
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
    isEnabled: runtimeKey !== null,
    runtimeKey,
    sendMessage,
  };
}
