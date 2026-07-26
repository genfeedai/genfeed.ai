import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import { AgentFullPageMobileBar } from '@genfeedai/agent/components/AgentFullPageMobileBar';
import { AgentFullPageMobileDrawers } from '@genfeedai/agent/components/AgentFullPageMobileDrawers';
import { AgentFullPageOnboardingChrome } from '@genfeedai/agent/components/AgentFullPageOnboardingChrome';
import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { AgentSetupPanel } from '@genfeedai/agent/components/AgentSetupPanel';
import { AgentSidebarContent } from '@genfeedai/agent/components/AgentSidebarContent';
import { useConversationInspectorShell } from '@genfeedai/agent/components/ConversationInspectorShellContext';
import { useAgentFullPage } from '@genfeedai/agent/components/useAgentFullPage';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { MemberRole } from '@genfeedai/enums';
import { AgentThreadStatus } from '@genfeedai/enums';
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
  ) : null;

  const hasInlineContextPanel = !inspectorShell && contextPanel !== null;
  const setInspectorHasPanel = inspectorShell?.setHasPanel;
  const hasProjectedContextPanel = Boolean(inspectorShell) && !!contextPanel;

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
        'flex min-h-0 flex-1 overflow-hidden bg-card text-card-foreground',
        onboardingMode && 'max-md:pb-14',
      )}
    >
      {showThreadSidebar ? (
        <div className="hidden xl:flex xl:w-[15rem] xl:shrink-0 xl:border-r xl:border-border xl:bg-background-secondary">
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
                  ? 'This thread is archived. It is visible for reference but cannot be edited.'
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
                  ? "I'm your AI content agent. Let's get you set up in a few minutes."
                  : 'Ask for help planning content, reviewing drafts, or understanding what to do next.'
              }
              placeholder="Ask for help with content, review, or planning..."
              suggestedActions={
                onboardingMode ? ONBOARDING_SUGGESTED_ACTIONS : resolvedActions
              }
              showSuggestedActionsWhenNotEmpty={showRuntimeSuggestedActions}
              onCreateFollowUpTasks={onCreateFollowUpTasks}
              onOnboardingCompleted={onOnboardingCompleted}
              onOAuthConnect={onOAuthConnect}
              onBrandCreate={onBrandCreate}
              onSelectCreditPack={onSelectCreditPack}
              onboardingMode={onboardingMode}
              isWideLayout={!hasInlineContextPanel}
              promptBarLayoutMode="surface-fixed"
              workspacePlanningTaskId={workspacePlanningTaskId}
            />
          </div>

          {hasInlineContextPanel ? (
            <div className="hidden min-h-0 overflow-hidden xl:flex xl:w-[24rem] xl:shrink-0 xl:border-l xl:border-border xl:bg-background-secondary">
              {contextPanel}
            </div>
          ) : null}
        </div>
      </div>

      {inspectorShell?.portalTarget && contextPanel
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
