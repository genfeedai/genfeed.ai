import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import { AgentFullPageMobileBar } from '@genfeedai/agent/components/AgentFullPageMobileBar';
import { AgentFullPageMobileDrawers } from '@genfeedai/agent/components/AgentFullPageMobileDrawers';
import { AgentFullPageOnboardingChrome } from '@genfeedai/agent/components/AgentFullPageOnboardingChrome';
import { AgentOutputsPanel } from '@genfeedai/agent/components/AgentOutputsPanel';
import { AgentSidebarContent } from '@genfeedai/agent/components/AgentSidebarContent';
import { useAgentFullPage } from '@genfeedai/agent/components/useAgentFullPage';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { MemberRole } from '@genfeedai/enums';
import { AgentThreadStatus } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReactElement } from 'react';

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
  onSelectCreditPack,
  userRole,
}: AgentFullPageProps): ReactElement {
  const {
    activeThreadStatus,
    currentStepId,
    hasThreadOutputs,
    isLoadingThread,
    mobileChecklistOpen,
    mobileOutputsOpen,
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
    setMobileThreadsOpen,
    showRuntimeSuggestedActions,
    workspacePlanningTaskId,
    ONBOARDING_SUGGESTED_ACTIONS,
  } = useAgentFullPage({
    apiService,
    authReady,
    threadId,
    onboardingMode,
    userRole,
  });

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
          onOpenThreads={() => setMobileThreadsOpen(true)}
          onOpenOutputs={() => setMobileOutputsOpen(true)}
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
              onSelectCreditPack={onSelectCreditPack}
              onboardingMode={onboardingMode}
              isWideLayout={!hasThreadOutputs}
              promptBarLayoutMode="surface-fixed"
              workspacePlanningTaskId={workspacePlanningTaskId}
            />
          </div>

          {hasThreadOutputs ? (
            <div className="hidden xl:flex xl:w-[24rem] xl:shrink-0 xl:border-l xl:border-border xl:bg-background-secondary">
              <AgentOutputsPanel className="h-full w-full" />
            </div>
          ) : null}
        </div>
      </div>

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
      />
    </div>
  );
}
