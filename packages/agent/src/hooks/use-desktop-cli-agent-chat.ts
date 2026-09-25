'use client';

import type { SendStreamMessageOptions } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { useDesktopLocalTools } from '@genfeedai/agent/hooks/use-desktop-local-tools';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { resolveDesktopCliRuntimeKey } from '@genfeedai/agent/utils/agent-runtime-options.util';
import { getGenfeedDesktopBridge } from '@genfeedai/agent/utils/desktop-bridge.util';
import {
  type DesktopCliAgentTurnHandleRef,
  runDesktopCliAgentTurn,
} from '@genfeedai/agent/utils/desktop-cli-agent-turn.util';
import type { AgentExternalRuntimeKey } from '@genfeedai/contracts/constants';
import { useCallback, useRef } from 'react';

export interface DesktopCliAgentChat {
  /** Stops the running local turn. Returns false when none is running. */
  cancelActiveTurn: () => boolean;
  /** True when sends for the visible thread go to the local CLI runtime. */
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
  const desktopTools = useDesktopLocalTools();
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const activeThreadRuntimeKey = useAgentChatStore(
    (s) =>
      s.threads.find((thread) => thread.id === s.activeThreadId)?.runtimeKey,
  );
  const draftRuntimeKey = useAgentChatStore((s) => s.draftRuntimeKey);
  const activeTurnRef: DesktopCliAgentTurnHandleRef = useRef(null);

  const runtimeKey = resolveDesktopCliRuntimeKey({
    activeThreadId,
    desktopTools,
    draftRuntimeKey,
    hasDesktopBridge: getGenfeedDesktopBridge() !== null,
    thread: { runtimeKey: activeThreadRuntimeKey },
  });

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

      await runDesktopCliAgentTurn({
        activeTurnRef,
        bridge,
        content,
        options,
        runtimeKey,
      });
    },
    [runtimeKey],
  );

  const cancelActiveTurn = useCallback((): boolean => {
    const activeTurn = activeTurnRef.current;
    if (!activeTurn) {
      return false;
    }

    void activeTurn.bridge.agentRuntime
      .cancelTurn(activeTurn.turnId)
      .catch(() => undefined);
    return true;
  }, []);

  return {
    cancelActiveTurn,
    isEnabled: runtimeKey !== null,
    runtimeKey,
    sendMessage,
  };
}
