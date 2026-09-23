import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import { AgentFullPageMobileBar } from '@genfeedai/agent/components/AgentFullPageMobileBar';
import { AgentFullPageMobileDrawers } from '@genfeedai/agent/components/AgentFullPageMobileDrawers';
import { AgentFullPageOnboardingChrome } from '@genfeedai/agent/components/AgentFullPageOnboardingChrome';
import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { AgentSetupPanel } from '@genfeedai/agent/components/AgentSetupPanel';
import { AgentSidebarContent } from '@genfeedai/agent/components/AgentSidebarContent';
import AgentThreadContextPanel from '@genfeedai/agent/components/AgentThreadContextPanel';
import { useConversationInspectorShell } from '@genfeedai/agent/components/ConversationInspectorShellContext';
import { useAgentFullPage } from '@genfeedai/agent/components/useAgentFullPage';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { MemberRole } from '@genfeedai/contracts';
import { AgentThreadStatus } from '@genfeedai/contracts';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReactElement, ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

const showOnboardingChecklistChrome = false;

interface AgentFullPageProps {
  apiService: AgentApiService;
  /** Knowledge selection sent with every turn from the composer. */
  knowledgeSelection?: KnowledgeSelection;
  /** Host-provided Knowledge picker rendered inside the composer. */
  knowledgePicker?: ReactNode;
  authReady?: boolean;
  threadId?: string;
  showThreadSidebar?: boolean;
  onboardingMode?: boolean;
  onOnboardingCompleted?: () => void | Promise<void>;
  onCreateFollowUpTasks?: (taskId: string) => Promise<{ createdCount: number }>;
  onOAuthConnect?: (platform: string) => void;
  onBrandCreate?: (payload: {
    name: string;
    description: string;
  }) => void | Promise<void>;
  /** #4670 Open in Studio: navigates to the ready-to-use Studio generate URL. */
  onOpenInStudio?: (studioUrl: string) => void;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
  onNavigateToBilling?: () => void;
  userRole?: MemberRole;
}

export function AgentFullPage({
  knowledgeSelection,
  knowledgePicker,
  apiService,
  authReady = true,
  threadId,
  showThreadSidebar = true,
  onboardingMode = false,
  onOnboardingCompleted,
  onCreateFollowUpTasks,
  onOAuthConnect,
  onBrandCreate,
  onOpenInStudio,
  onSelectCreditPack,
  userRole,
}: AgentFullPageProps): ReactElement {
  const {
    activeThreadStatus,
    agentSetup,
    currentStepId,
    handleUnarchiveActiveThread,
    hasThreadOutputs,
    isLoadingThread,
    mobileChecklistOpen,
    mobileOutputsOpen,
    mobileSetupOpen,
    mobileThreadsOpen,
    onboardingCompletionPercent,
    onboardingEarnedCredits,
    onboardingSignupGiftCredits,
    onboardingSteps,
    onboardingTotalJourneyCredits,
    onboardingTotalVisibleCredits,
    resolvedActions,
    setMobileChecklistOpen,
    setMobileOutputsOpen,
    setMobileSetupOpen,
    setMobileThreadsOpen,
    showRuntimeSuggestedActions,
    showSetupPanel,
    workspacePlanningTaskId,
    ONBOARDING_SUGGESTED_ACTIONS,
  } = useAgentFullPage({
    apiService,
    authReady,
    threadId,
    onboardingMode,
    userRole,
  });

  // Inside the workspace shell the context panels belong to the shell's
  // inspector rail — the conversation column must not paint a second
  // right-hand column next to it. Standalone (no provider) keeps the panels
  // inline, which is what the onboarding route and unit tests render.
  const inspectorShell = useConversationInspectorShell();

  // Outputs win once the thread has produced something, setup wins while the
  // brand is still incomplete, and thread context is the floor — the rail is
  // never empty, because a conversation always has a brand, channels, and a
  // history worth showing.
  const contextPanel = hasThreadOutputs ? (
    <AgentOutputsPanel className="h-full w-full" />
  ) : showSetupPanel ? (
    <AgentSetupPanel
      className="h-full w-full"
      brand={agentSetup.brand}
      connectedConnections={agentSetup.connectedConnections}
      connectedPlatformsCount={agentSetup.connectedPlatformsCount}
      onOAuthConnect={onOAuthConnect}
    />
  ) : (
    <AgentThreadContextPanel
      brand={agentSetup.brand}
      className="h-full w-full"
      completenessScore={agentSetup.completenessScore}
      connectedConnections={agentSetup.connectedConnections}
      threadId={threadId}
    />
  );

  const setInspectorHasPanel = inspectorShell?.setHasPanel;
  const hasProjectedContextPanel =
    !onboardingMode && inspectorShell?.isActive === true;

  useEffect(() => {
    if (!setInspectorHasPanel) {
      return;
    }

    setInspectorHasPanel(hasProjectedContextPanel);

    return () => setInspectorHasPanel(false);
  }, [hasProjectedContextPanel, setInspectorHasPanel]);

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 overflow-hidden bg-background text-foreground',
      )}
    >
      {!onboardingMode && showThreadSidebar ? (
        <div className="hidden xl:flex xl:w-[15rem] xl:shrink-0 xl:border-r xl:border-border xl:bg-background">
          <AgentSidebarContent apiService={apiService} />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AgentFullPageMobileBar
          showThreadSidebar={!onboardingMode && showThreadSidebar}
          hasThreadOutputs={!onboardingMode && hasThreadOutputs}
          showSetupPanel={!onboardingMode && showSetupPanel}
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
              knowledgePicker={knowledgePicker}
              isLoadingThread={isLoadingThread}
              isStreaming
              isReadOnly={activeThreadStatus === AgentThreadStatus.ARCHIVED}
              emptyStateTitle={
                onboardingMode ? 'Your brand. Your first post.' : 'Start a chat'
              }
              emptyStateDescription={
                onboardingMode
                  ? 'An image and a tweet, made for you. Review the draft before connecting an account.'
                  : 'Plan content, review drafts, or decide what to do next.'
              }
              placeholder={
                onboardingMode
                  ? 'Tell us what to change, or ask for another version…'
                  : 'Ask for help with content, review, or planning...'
              }
              suggestedActions={
                onboardingMode ? ONBOARDING_SUGGESTED_ACTIONS : resolvedActions
              }
              showSuggestedActionsWhenNotEmpty={showRuntimeSuggestedActions}
              onCreateFollowUpTasks={onCreateFollowUpTasks}
              onOnboardingCompleted={onOnboardingCompleted}
              onOAuthConnect={onOAuthConnect}
              onBrandCreate={onBrandCreate}
              onOpenInStudio={onOpenInStudio}
              onSelectCreditPack={onSelectCreditPack}
              onUnarchive={handleUnarchiveActiveThread}
              onboardingMode={onboardingMode}
              isWideLayout
              promptBarLayoutMode="surface-fixed"
              workspacePlanningTaskId={workspacePlanningTaskId}
            />
          </div>
        </div>
      </div>

      {hasProjectedContextPanel && inspectorShell?.portalTarget && contextPanel
        ? createPortal(
            <div className="min-h-0 w-full">{contextPanel}</div>,
            inspectorShell.portalTarget,
          )
        : null}

      {showOnboardingChecklistChrome && onboardingMode && (
        <AgentFullPageOnboardingChrome
          completionPercent={onboardingCompletionPercent}
          currentStepId={currentStepId}
          earnedCredits={onboardingEarnedCredits}
          signupGiftCredits={onboardingSignupGiftCredits}
          steps={onboardingSteps}
          totalOnboardingCreditsVisible={onboardingTotalVisibleCredits}
          totalJourneyCredits={onboardingTotalJourneyCredits}
          mobileChecklistOpen={mobileChecklistOpen}
          onMobileChecklistOpenChange={setMobileChecklistOpen}
        />
      )}

      <AgentFullPageMobileDrawers
        apiService={apiService}
        showThreadSidebar={!onboardingMode && showThreadSidebar}
        mobileThreadsOpen={mobileThreadsOpen}
        onMobileThreadsOpenChange={setMobileThreadsOpen}
        hasThreadOutputs={!onboardingMode && hasThreadOutputs}
        mobileOutputsOpen={mobileOutputsOpen}
        onMobileOutputsOpenChange={setMobileOutputsOpen}
        showSetupPanel={!onboardingMode && showSetupPanel}
        mobileSetupOpen={mobileSetupOpen}
        onMobileSetupOpenChange={setMobileSetupOpen}
        agentSetup={agentSetup}
        onOAuthConnect={onOAuthConnect}
      />
    </div>
  );
}
