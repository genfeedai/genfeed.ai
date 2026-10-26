import {
  ContextSidebarPanel,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import { AgentContextCoveragePanel } from '@genfeedai/agent/components/AgentContextCoveragePanel';
import { AgentFullPageMobileBar } from '@genfeedai/agent/components/AgentFullPageMobileBar';
import { AgentFullPageMobileDrawers } from '@genfeedai/agent/components/AgentFullPageMobileDrawers';
import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { AgentSidebarContent } from '@genfeedai/agent/components/AgentSidebarContent';
import { AgentThreadNotFound } from '@genfeedai/agent/components/AgentThreadNotFound';
import { useAgentFullPage } from '@genfeedai/agent/components/useAgentFullPage';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import type { MemberRole } from '@genfeedai/contracts';
import { AgentThreadStatus } from '@genfeedai/contracts';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';

interface AgentFullPageProps {
  apiService: AgentApiService;
  /** Knowledge selection sent with every turn from the composer. */
  knowledgeSelection?: KnowledgeSelection;
  /** Host-provided Knowledge picker rendered inside the composer. */
  knowledgeSection?: ReactNode;
  authReady?: boolean;
  /** Where the not-found state sends the user to start a new chat. */
  newChatHref?: string;
  threadId?: string;
  showThreadSidebar?: boolean;
  onCreateFollowUpTasks?: (taskId: string) => Promise<{ createdCount: number }>;
  onOAuthConnect?: (platform: string) => void;
  onBrandCreate?: (payload: {
    name: string;
    description: string;
  }) => void | Promise<void>;
  /** #4670 Open in Studio: navigates to the ready-to-use Studio generate URL. */
  onOpenInStudio?: (studioUrl: string) => void;
  onNavigateToBilling?: () => void;
  userRole?: MemberRole;
}

export function AgentFullPage({
  knowledgeSelection,
  knowledgeSection,
  apiService,
  authReady = true,
  newChatHref,
  threadId,
  showThreadSidebar = true,
  onCreateFollowUpTasks,
  onOAuthConnect,
  onBrandCreate,
  onOpenInStudio,
  userRole,
}: AgentFullPageProps): ReactElement {
  const translate = useTranslations('agent.fullPage');
  const {
    activeThreadStatus,
    agentSetup,
    handleUnarchiveActiveThread,
    hasThreadOutputs,
    isLoadingThread,
    isThreadNotFound,
    mobileOutputsOpen,
    mobileSetupOpen,
    mobileThreadsOpen,
    resolvedActions,
    setMobileOutputsOpen,
    setMobileSetupOpen,
    setMobileThreadsOpen,
    showRuntimeSuggestedActions,
    showSetupPanel,
    workspacePlanningTaskId,
  } = useAgentFullPage({
    apiService,
    authReady,
    threadId,
    userRole,
  });

  const contextSidebar = useContextSidebar();
  // Coverage is requested for the thread's own brand, never the workspace's
  // current one; a thread without a brand reads the organization lane only.
  const threadBrandId = useAgentChatStore(
    (state) =>
      state.threads.find((thread) => thread.id === threadId)?.brandId ??
      undefined,
  );
  const isContextSidebarVisible = contextSidebar
    ? contextSidebar.isOpen || contextSidebar.isMobileOpen
    : true;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 overflow-hidden bg-background text-foreground',
      )}
    >
      {showThreadSidebar ? (
        <div className="hidden xl:flex xl:w-[15rem] xl:shrink-0 xl:border-r xl:border-border xl:bg-background">
          <AgentSidebarContent apiService={apiService} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AgentFullPageMobileBar
          showThreadSidebar={showThreadSidebar}
          hasThreadOutputs={hasThreadOutputs}
          showSetupPanel={showSetupPanel}
          onOpenThreads={() => setMobileThreadsOpen(true)}
          onOpenOutputs={() => setMobileOutputsOpen(true)}
          onOpenSetup={() => setMobileSetupOpen(true)}
        />

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {isThreadNotFound ? (
              <AgentThreadNotFound newChatHref={newChatHref} />
            ) : (
              <AgentChatContainer
                archivedNotice={
                  activeThreadStatus === AgentThreadStatus.ARCHIVED
                    ? 'This thread is archived. Unarchive it to continue the conversation.'
                    : null
                }
                apiService={apiService}
                knowledgeSelection={knowledgeSelection}
                knowledgeSection={knowledgeSection}
                isLoadingThread={isLoadingThread}
                isStreaming
                isReadOnly={activeThreadStatus === AgentThreadStatus.ARCHIVED}
                emptyStateTitle="Start a chat"
                emptyStateDescription="Plan content, review drafts, or decide what to do next."
                placeholder={translate('placeholder')}
                suggestedActions={resolvedActions}
                showSuggestedActionsWhenNotEmpty={showRuntimeSuggestedActions}
                onCreateFollowUpTasks={onCreateFollowUpTasks}
                onOAuthConnect={onOAuthConnect}
                onBrandCreate={onBrandCreate}
                onOpenInStudio={onOpenInStudio}
                onUnarchive={handleUnarchiveActiveThread}
                isWideLayout
                promptBarLayoutMode="surface-fixed"
                workspacePlanningTaskId={workspacePlanningTaskId}
              />
            )}
          </div>
        </div>
      </div>

      {/* Inside the workspace shell the thread's context is the sidebar's
        selection: source coverage always, the outputs once there are any. The
        sidebar opens by itself only when there are outputs; otherwise the
        topbar Context toggle opens it. */}
      <ContextSidebarPanel
        selection={{
          id: `thread-context:${threadId ?? 'new'}:${hasThreadOutputs ? 'outputs' : 'coverage'}`,
          isOpenByDefault: hasThreadOutputs,
          kind: 'thread',
          origin: 'automatic',
          title: translate(hasThreadOutputs ? 'outputs' : 'context'),
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AgentContextCoveragePanel
            apiService={apiService}
            brandId={threadBrandId}
            isActive={isContextSidebarVisible}
          />
          {hasThreadOutputs ? (
            <AgentOutputsPanel className="h-full w-full" />
          ) : null}
        </div>
      </ContextSidebarPanel>

      <AgentFullPageMobileDrawers
        apiService={apiService}
        showThreadSidebar={showThreadSidebar}
        mobileThreadsOpen={mobileThreadsOpen}
        onMobileThreadsOpenChange={setMobileThreadsOpen}
        hasThreadOutputs={hasThreadOutputs}
        mobileOutputsOpen={mobileOutputsOpen}
        onMobileOutputsOpenChange={setMobileOutputsOpen}
        showSetupPanel={showSetupPanel}
        mobileSetupOpen={mobileSetupOpen}
        onMobileSetupOpenChange={setMobileSetupOpen}
        agentSetup={agentSetup}
        onOAuthConnect={onOAuthConnect}
      />
    </div>
  );
}
