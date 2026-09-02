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
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

const showOnboardingChecklistChrome = false;

interface AgentFullPageProps {
  apiService: AgentApiService;
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
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
  onNavigateToBilling?: () => void;
  userRole?: MemberRole;
}

export function AgentFullPage({
  apiService,
  authReady = true,
  threadId,
  showThreadSidebar = true,
  onboardingMode = false,
  onOnboardingCompleted,
  onCreateFollowUpTasks,
  onOAuthConnect,
  onBrandCreate,
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

  // T3 density on product agent routes: single conversation column.
  // Onboarding keeps the setup/outputs dual-column chrome — and only those two,
  // so a finished checklist collapses back to one column instead of pinning a
  // reference panel next to the welcome conversation. Product routes project
  // into ConversationInspector when the workspace shell provides it; mobile
  // drawers still expose outputs/setup without a permanent right rail.
  const hasInlineContextPanel =
    !inspectorShell && onboardingMode && (hasThreadOutputs || showSetupPanel);
  const setInspectorHasPanel = inspectorShell?.setHasPanel;
  const hasProjectedContextPanel = inspectorShell?.isActive === true;

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
        onboardingMode && 'max-md:pb-14',
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
              isLoadingThread={isLoadingThread}
              isStreaming
              isReadOnly={activeThreadStatus === AgentThreadStatus.ARCHIVED}
              emptyStateTitle={
                onboardingMode ? 'Welcome to GenFeed' : 'Start a chat'
              }
              emptyStateDescription={
                onboardingMode
                  ? "I'm your AI content agent. Let's get you set up."
                  : 'Plan content, review drafts, or decide what to do next.'
              }
              placeholder={
                onboardingMode
                  ? 'Paste a site or handle, or type what you make...'
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
              onSelectCreditPack={onSelectCreditPack}
              onUnarchive={handleUnarchiveActiveThread}
              onboardingMode={onboardingMode}
              isWideLayout={!hasInlineContextPanel}
              promptBarLayoutMode="surface-fixed"
              workspacePlanningTaskId={workspacePlanningTaskId}
            />
          </div>

          {hasInlineContextPanel ? (
            <div className="hidden min-h-0 overflow-hidden xl:flex xl:w-[24rem] xl:shrink-0 xl:border-l xl:border-border xl:bg-background">
              {contextPanel}
            </div>
          ) : null}
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
