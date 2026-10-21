import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import { AgentFullPageMobileBar } from '@genfeedai/agent/components/AgentFullPageMobileBar';
import { AgentFullPageMobileDrawers } from '@genfeedai/agent/components/AgentFullPageMobileDrawers';
import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { AgentSidebarContent } from '@genfeedai/agent/components/AgentSidebarContent';
import { useAgentFullPage } from '@genfeedai/agent/components/useAgentFullPage';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
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
          </div>
        </div>
      </div>

      {/* Inside the workspace shell the thread's outputs are the context
        sidebar's selection; the sidebar stays closed until there are any. */}
      {hasThreadOutputs ? (
        <ContextSidebarPanel
          selection={{
            id: `thread-outputs:${threadId ?? 'new'}`,
            kind: 'thread',
            origin: 'automatic',
            title: translate('outputs'),
          }}
        >
          <AgentOutputsPanel className="h-full w-full" />
        </ContextSidebarPanel>
      ) : null}

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
