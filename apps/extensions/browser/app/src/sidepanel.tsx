import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Plus } from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useRef } from 'react';
import { ChatContainer } from '~components/chat/ChatContainer';
import { CreatePanel } from '~components/create/CreatePanel';
import { ThreadList } from '~components/history/ThreadList';
import { type ActiveTab, SidebarNav } from '~components/navigation/SidebarNav';
import { IdeaDraftPage as ImportedPostsPage } from '~components/pages/IdeaDraftPage';
import { KnowledgeCapturePage } from '~components/pages/KnowledgeCapturePage';
import { BrandSelector } from '~components/settings/BrandSelector';
import { OrganizationSelector } from '~components/settings/OrganizationSelector';
import { SettingsPanel } from '~components/settings/SettingsPanel';
import { useAccountThemeSync } from '~hooks/use-account-theme-sync';
import { useExtensionTheme } from '~hooks/use-extension-theme';
import { useWorkspace } from '~hooks/use-workspace';
import type { CaptureMode } from '~models/knowledge-capture.model';
import { appDomain } from '~services/environment.service';
import { initializeErrorTracking } from '~services/error-tracking.service';
import { loadWorkspace } from '~services/workspace.service';
import { useChatStore } from '~store/use-chat-store';
import type { ExtensionMessage } from '~types/extension';
import { extensionIdeaTab } from '~utils/extension-idea-tab.util';

import '~style.css';
import Spinner from '@ui/primitives/spinner';

initializeErrorTracking('sidepanel');

type AuthPanelState =
  | { status: 'syncing'; error: null }
  | { status: 'authenticated'; error: null }
  | { status: 'blocked'; error: string };

interface PanelState {
  activeTab: ActiveTab;
  pendingAuthor: string;
  pendingContent: string;
  pendingUrl: string;
  captureMode?: CaptureMode;
}

type PanelAction =
  | { type: 'resetScope' }
  | { type: 'addToKnowledge'; url: string }
  | { type: 'openMode'; payload: ExtensionMessage }
  | { type: 'setActiveTab'; activeTab: ActiveTab };

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'resetScope':
      return {
        ...state,
        pendingAuthor: '',
        pendingContent: '',
        pendingUrl: '',
        captureMode: undefined,
      };
    case 'openMode': {
      const { type, content, url } = action.payload;
      const activeTabByMessage: Record<ExtensionMessage['type'], ActiveTab> = {
        IDEA: extensionIdeaTab(action.payload),
        REMIX: 'remix',
        REPLY: 'reply',
      };

      return {
        ...state,
        activeTab: activeTabByMessage[type],
        pendingContent: content ?? '',
        pendingUrl: url ?? '',
        captureMode: action.payload.captureMode,
      };
    }
    case 'addToKnowledge':
      return {
        ...state,
        activeTab: 'knowledge',
        captureMode: 'link',
        pendingContent: '',
        pendingUrl: action.url,
      };
    case 'setActiveTab':
      return { ...state, activeTab: action.activeTab };
    default:
      return state;
  }
}

function SidePanelRoute({
  activeTab,
  pendingContent,
  pendingUrl,
  captureMode,
  onActiveTabChange,
  onAddToKnowledge,
}: PanelState & {
  onActiveTabChange: (activeTab: ActiveTab) => void;
  onAddToKnowledge: (url: string) => void;
}): ReactElement {
  switch (activeTab) {
    case 'chat':
      return <ChatContainer />;
    case 'remix':
      return (
        <ChatContainer
          mode="remix"
          initialContent={pendingContent}
          initialUrl={pendingUrl}
        />
      );
    case 'reply':
      return (
        <ChatContainer
          mode="reply"
          initialContent={pendingContent}
          initialUrl={pendingUrl}
        />
      );
    case 'idea':
      return (
        <ImportedPostsPage
          initialUrl={pendingUrl}
          onAddToKnowledge={onAddToKnowledge}
        />
      );
    case 'knowledge':
      return (
        <KnowledgeCapturePage
          initialMode={captureMode}
          initialContent={pendingContent}
          initialUrl={pendingUrl}
        />
      );
    case 'history':
      return <ThreadList onOpenThread={() => onActiveTabChange('chat')} />;
    case 'create':
      return <CreatePanel onStartChat={() => onActiveTabChange('chat')} />;
    case 'settings':
      return <SettingsPanel />;
    default:
      return <ChatContainer />;
  }
}

function SidePanelContent() {
  const isGenerating = useChatStore((s) => s.isGenerating);
  const workspace = useWorkspace();
  const mountedRevision = useRef<number | null>(null);
  if (workspace.status === 'ready')
    mountedRevision.current = workspace.snapshot.revision;
  const authState: AuthPanelState =
    workspace.status === 'ready'
      ? { status: 'authenticated', error: null }
      : workspace.status === 'blocked'
        ? { status: 'blocked', error: workspace.error }
        : { status: 'syncing', error: null };
  const retryAuth = () => {
    void loadWorkspace({ forceRefresh: true }).catch(() => undefined);
  };
  useAccountThemeSync(workspace.status === 'ready');
  const [panelState, dispatchPanel] = useReducer(panelReducer, {
    activeTab: 'chat',
    pendingAuthor: '',
    pendingContent: '',
    pendingUrl: '',
  } satisfies PanelState);

  const scopeRevision =
    workspace.status === 'ready' || workspace.status === 'refreshing'
      ? workspace.snapshot.revision
      : null;
  const panelRevision = useRef<number | null>(null);
  useEffect(() => {
    if (scopeRevision !== null && panelRevision.current !== scopeRevision) {
      panelRevision.current = scopeRevision;
      dispatchPanel({ type: 'resetScope' });
    }
  }, [scopeRevision]);

  // Listen for OPEN_MODE messages from the background/content scripts
  useEffect(() => {
    function handleMessage(message: {
      type?: string;
      payload?: ExtensionMessage;
    }) {
      if (message.type !== 'OPEN_MODE' || !message.payload) {
        return;
      }
      dispatchPanel({ payload: message.payload, type: 'openMode' });
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const isInitial = mountedRevision.current === null;
  if (authState.status === 'syncing' && isInitial) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  const recovery =
    authState.status === 'blocked' ? (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6">
        <p role="alert" className="text-sm text-muted-foreground">
          {authState.error}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={retryAuth}>
            Retry
          </Button>
          <Button
            type="button"
            variant={ButtonVariant.SECONDARY}
            onClick={() => {
              void chrome.tabs.create({ url: appDomain }).catch(() => {
                window.open(appDomain, '_blank', 'noopener,noreferrer');
              });
            }}
          >
            Open Genfeed
          </Button>
        </div>
      </div>
    ) : null;
  if (isInitial && recovery) return recovery;

  const setActiveTab = (activeTab: ActiveTab) =>
    dispatchPanel({ activeTab, type: 'setActiveTab' });

  return (
    <>
      {recovery}
      <div
        hidden={
          workspace.status !== 'ready' && workspace.status !== 'refreshing'
        }
        aria-busy={workspace.status === 'refreshing'}
        className="gf-app flex h-screen min-w-0 flex-col bg-background text-foreground"
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <span className="text-sm font-semibold tracking-tight">Genfeed</span>
          <div className="ml-auto min-w-0 w-40">
            <OrganizationSelector />
            <BrandSelector />
          </div>
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            withWrapper={false}
            icon={<Plus className="size-4" />}
            ariaLabel="New conversation"
            isDisabled={isGenerating || workspace.status !== 'ready'}
            onClick={() => {
              useChatStore.getState().clearMessages();
              useChatStore.getState().setActiveThread(null);
              setActiveTab('chat');
            }}
          />
        </header>
        <SidebarNav
          activeTab={panelState.activeTab}
          onTabChange={setActiveTab}
        />
        {workspace.status === 'refreshing' && (
          <p role="status">Checking your Genfeed workspace…</p>
        )}
        <main
          inert={workspace.status !== 'ready'}
          className="min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <SidePanelRoute
            key={mountedRevision.current ?? 'loading'}
            {...panelState}
            onActiveTabChange={setActiveTab}
            onAddToKnowledge={(url) =>
              dispatchPanel({ type: 'addToKnowledge', url })
            }
          />
        </main>
      </div>
    </>
  );
}

export default function SidePanel() {
  const isThemeReady = useExtensionTheme();

  return isThemeReady ? <SidePanelContent /> : null;
}
