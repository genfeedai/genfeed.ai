import {
  AgentCliTerminalBody,
  AgentCliTerminalControls,
  useAgentCliTerminal,
} from '@genfeedai/agent/components/AgentCliTerminal';
import { AgentOAuthConnectMenu } from '@genfeedai/agent/components/AgentOAuthConnectMenu';
import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { AgentTerminalHeader } from '@genfeedai/agent/components/AgentTerminalHeader';
import { useAgentRuntimeSelection } from '@genfeedai/agent/hooks/use-agent-runtime-selection';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
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
  authReady?: boolean;
  isActive?: boolean;
  onNavigateToBilling?: () => void;
  onOAuthConnect?: (platform: string) => void | Promise<void>;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
}

type AgentRailTab = 'chat' | 'outputs';

const AGENT_PANEL_TAB_STORAGE_KEY = 'genfeed:agent-panel:tab';

const AGENT_PANEL_OUTPUTS_CONTENT = (
  <AgentOutputsPanel
    mode="compact"
    emptyTitle="No outputs in this thread"
    emptyDescription="As the agent generates copy, images, or media, they will appear here."
    className="h-full"
  />
);

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
  authReady = true,
  isActive = true,
  onOAuthConnect,
}: AgentPanelProps): ReactElement {
  const router = useRouter();
  const { href } = useOrgUrl();

  // This component is loaded with ssr: false — localStorage is safe to read here
  const [defaultTab] = useState<AgentRailTab>(() => readPersistedPanelTab());

  const isOpen = useAgentChatStore((s) => s.isOpen);
  const toggleOpen = useAgentChatStore((s) => s.toggleOpen);
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const threads = useAgentChatStore((s) => s.threads);
  const seedComposer = useAgentChatStore((s) => s.seedComposer);

  const setCreditsRemaining = useAgentChatStore((s) => s.setCreditsRemaining);
  const setModelCosts = useAgentChatStore((s) => s.setModelCosts);
  const {
    catalog: runtimeCatalog,
    onRuntimeChange: handleRuntimeChange,
    selectedRuntime,
  } = useAgentRuntimeSelection({ apiService, isActive });

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );

  const threadLabel = activeThread?.title || activeThreadId || 'new-session';

  // Fetch credits info on mount
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const controller = new AbortController();

    apiService
      .getCreditsInfo(controller.signal)
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

  const handleExpand = useCallback(() => {
    router.push(
      href(
        activeThreadId
          ? `${APP_ROUTES.AGENT.ROOT}/${activeThreadId}`
          : APP_ROUTES.AGENT.NEW,
      ),
    );
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

  const terminalController = useAgentCliTerminal(apiService, authReady);

  const handleSendSelection = useCallback(
    (text: string) => {
      seedComposer(text, activeThreadId);
    },
    [activeThreadId, seedComposer],
  );

  const terminalContent = (
    <AgentCliTerminalBody
      containerRef={terminalController.containerRef}
      isSearchOpen={terminalController.isSearchOpen}
      searchQuery={terminalController.searchQuery}
      onSearchQueryChange={terminalController.setSearchQuery}
      onCloseSearch={terminalController.toggleSearch}
      onSendSelection={handleSendSelection}
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
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <AgentTerminalHeader
            catalog={runtimeCatalog}
            selectedRuntime={selectedRuntime}
            threadLabel={threadLabel}
            onRuntimeChange={handleRuntimeChange}
          />
          <AgentOAuthConnectMenu onOAuthConnect={onOAuthConnect} />
          <AgentCliTerminalControls controller={terminalController} />
        </div>
      }
      subtitle="Terminal, runtime routing, and generated outputs"
      chatContent={terminalContent}
      outputsContent={AGENT_PANEL_OUTPUTS_CONTENT}
    />
  );
}
