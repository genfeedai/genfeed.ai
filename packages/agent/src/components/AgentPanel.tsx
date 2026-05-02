import { AgentCliTerminal } from '@genfeedai/agent/components/AgentCliTerminal';
import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { AgentTerminalHeader } from '@genfeedai/agent/components/AgentTerminalHeader';
import type { AgentRuntimeOption } from '@genfeedai/agent/models/agent-runtime.model';
import type {
  AgentApiService,
  AgentInstallReadiness,
} from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  buildAgentRuntimeCatalog,
  resolveThreadRuntimeOption,
} from '@genfeedai/agent/utils/agent-runtime-options.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { AgentPanelShell } from '@ui/agent-panel';
import { useRouter } from 'next/navigation';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface AgentPanelProps {
  apiService: AgentApiService;
  isActive?: boolean;
  onNavigateToBilling?: () => void;
  onOAuthConnect?: (platform: string) => void;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
}

type AgentRailTab = 'chat' | 'outputs';

const AGENT_PANEL_TAB_STORAGE_KEY = 'genfeed:agent-panel:tab';

function readPersistedPanelTab(): AgentRailTab {
  if (
    typeof window === 'undefined' ||
    typeof window.localStorage?.getItem !== 'function'
  ) {
    return 'chat';
  }

  try {
    const stored = window.localStorage.getItem(AGENT_PANEL_TAB_STORAGE_KEY);
    return stored === 'outputs' ? 'outputs' : 'chat';
  } catch {
    return 'chat';
  }
}

export function AgentPanel({
  apiService,
  isActive = true,
}: AgentPanelProps): ReactElement {
  const router = useRouter();
  const { href } = useOrgUrl();

  // This component is loaded with ssr: false — localStorage is safe to read here
  const [defaultTab] = useState<AgentRailTab>(() => readPersistedPanelTab());

  const isOpen = useAgentChatStore((s) => s.isOpen);
  const toggleOpen = useAgentChatStore((s) => s.toggleOpen);
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const threads = useAgentChatStore((s) => s.threads);
  const updateThread = useAgentChatStore((s) => s.updateThread);

  const setCreditsRemaining = useAgentChatStore((s) => s.setCreditsRemaining);
  const setModelCosts = useAgentChatStore((s) => s.setModelCosts);
  const [hostname, setHostname] = useState<string | null>(null);
  const [installReadiness, setInstallReadiness] =
    useState<AgentInstallReadiness | null>(null);
  const [draftRuntime, setDraftRuntime] = useState<AgentRuntimeOption | null>(
    null,
  );

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );

  const runtimeCatalog = useMemo(
    () =>
      buildAgentRuntimeCatalog({
        hostname,
        readiness: installReadiness,
      }),
    [hostname, installReadiness],
  );

  const selectedRuntime = useMemo(() => {
    if (!activeThreadId && draftRuntime) {
      return draftRuntime;
    }

    return resolveThreadRuntimeOption({
      catalog: runtimeCatalog,
      thread: activeThread,
    });
  }, [activeThread, activeThreadId, draftRuntime, runtimeCatalog]);

  const threadLabel = activeThread?.title || activeThreadId || 'new-session';

  // Fetch credits info on mount
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const controller = new AbortController();

    runAgentApiEffect(apiService.getCreditsInfoEffect(controller.signal))
      .then((info) => {
        if (!info) {
          return;
        }

        setCreditsRemaining(info.balance);
        setModelCosts(info.modelCosts);
      })
      .catch(() => {
        // Silently fail — credits display will show null
      });

    return () => controller.abort();
  }, [apiService, isActive, setCreditsRemaining, setModelCosts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setHostname(window.location.hostname);
  }, []);

  useEffect(() => {
    if (!hostname || !isActive) {
      return;
    }

    const controller = new AbortController();

    runAgentApiEffect(apiService.getInstallReadinessEffect(controller.signal))
      .then((readiness) => {
        setInstallReadiness(readiness);
      })
      .catch(() => {
        setInstallReadiness(null);
      });

    return () => controller.abort();
  }, [apiService, hostname, isActive]);

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
      setDraftRuntime(null);
      return;
    }

    updateThread(activeThreadId, {
      requestedModel: draftRuntime.requestedModel || undefined,
      runtimeKey: draftRuntime.key || undefined,
    });

    const controller = new AbortController();
    runAgentApiEffect(
      apiService.updateThreadEffect(
        activeThreadId,
        {
          requestedModel: draftRuntime.requestedModel || undefined,
          runtimeKey: draftRuntime.key || undefined,
        },
        controller.signal,
      ),
    )
      .then(() => {
        setDraftRuntime(null);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [activeThreadId, apiService, draftRuntime, threads, updateThread]);

  const handleExpand = useCallback(() => {
    router.push(href(activeThreadId ? `/chat/${activeThreadId}` : '/chat/new'));
  }, [activeThreadId, router, href]);

  const handleTabChange = useCallback((tab: AgentRailTab) => {
    if (
      typeof window !== 'undefined' &&
      typeof window.localStorage?.setItem === 'function'
    ) {
      try {
        window.localStorage.setItem(AGENT_PANEL_TAB_STORAGE_KEY, tab);
      } catch {
        // Ignore persistence failures in constrained environments.
      }
    }
  }, []);

  const handleRuntimeChange = useCallback(
    (runtime: AgentRuntimeOption) => {
      if (!activeThreadId) {
        setDraftRuntime(runtime);
        return;
      }

      updateThread(activeThreadId, {
        requestedModel: runtime.requestedModel || undefined,
        runtimeKey: runtime.key || undefined,
      });

      const controller = new AbortController();
      void runAgentApiEffect(
        apiService.updateThreadEffect(
          activeThreadId,
          {
            requestedModel: runtime.requestedModel || undefined,
            runtimeKey: runtime.key || undefined,
          },
          controller.signal,
        ),
      ).catch(() => undefined);
    },
    [activeThreadId, apiService, updateThread],
  );

  const terminalContent = <AgentCliTerminal apiService={apiService} />;

  const outputsContent = (
    <AgentOutputsPanel
      mode="compact"
      emptyTitle="No outputs in this thread"
      emptyDescription="As the agent generates copy, images, or media, they will appear here."
      className="h-full"
    />
  );

  return (
    <AgentPanelShell
      isOpen={isOpen}
      onToggle={toggleOpen}
      onExpand={handleExpand}
      onTabChange={handleTabChange}
      defaultTab={defaultTab}
      title="genfeed"
      headerContent={
        <AgentTerminalHeader
          catalog={runtimeCatalog}
          selectedRuntime={selectedRuntime}
          threadLabel={threadLabel}
          onRuntimeChange={handleRuntimeChange}
        />
      }
      subtitle="Terminal, runtime routing, and generated outputs"
      chatContent={terminalContent}
      outputsContent={outputsContent}
    />
  );
}
