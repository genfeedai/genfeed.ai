import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
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
  onOAuthConnect,
  onSelectCreditPack,
}: AgentPanelProps): ReactElement {
  const router = useRouter();
  const { href } = useOrgUrl();

  // This component is loaded with ssr: false — localStorage is safe to read here
  const [defaultTab] = useState<AgentRailTab>(() => readPersistedPanelTab());

  const isOpen = useAgentChatStore((s) => s.isOpen);
  const toggleOpen = useAgentChatStore((s) => s.toggleOpen);
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);

  const setCreditsRemaining = useAgentChatStore((s) => s.setCreditsRemaining);
  const setModelCosts = useAgentChatStore((s) => s.setModelCosts);
  const messages = useAgentChatStore((s) => s.messages);
  const pageContext = useAgentChatStore((s) => s.pageContext);

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

  // Resolve suggested actions from page context or use defaults
  const suggestedActions = useMemo(() => {
    const latestMessage = messages.at(-1);

    if (
      latestMessage?.role === 'assistant' &&
      latestMessage.metadata?.suggestedActions?.length
    ) {
      return latestMessage.metadata.suggestedActions;
    }

    return pageContext?.suggestedActions;
  }, [messages, pageContext]);

  const showRuntimeSuggestedActions = useMemo(() => {
    const latestMessage = messages.at(-1);

    return Boolean(
      latestMessage?.role === 'assistant' &&
        latestMessage.metadata?.suggestedActions?.length,
    );
  }, [messages]);

  const placeholder =
    pageContext?.placeholder ??
    'Ask for help with content, review, or planning...';

  const chatContent = (
    <AgentChatContainer
      apiService={apiService}
      isStreaming
      emptyStateTitle="Quick ask"
      emptyStateDescription="Ask for help with the page you are on, then open the full chat workspace when you need the complete thread."
      placeholder={placeholder}
      suggestedActions={suggestedActions}
      showSuggestedActionsWhenNotEmpty={showRuntimeSuggestedActions}
      onOAuthConnect={onOAuthConnect}
      onSelectCreditPack={onSelectCreditPack}
      promptBarLayoutMode="surface-fixed"
    />
  );

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
      chatContent={chatContent}
      outputsContent={outputsContent}
    />
  );
}
