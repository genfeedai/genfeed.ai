import { AgentFullPage } from '@genfeedai/agent';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useAgentBrandCreate } from '@genfeedai/hooks/agent/use-agent-brand-create';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import type { AgentWorkspacePageShellProps } from '@props/agent/agent-workspace-page-shell.props';
import { TasksService } from '@services/management/tasks.service';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useAgentWorkspace } from './agent-workspace-context';

export function AgentWorkspacePageShell({
  threadId,
}: AgentWorkspacePageShellProps) {
  const { push } = useRouter();
  const logoUrl = useThemeLogo();
  const [isSkipping, setIsSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);
  const { orgHref } = useOrgUrl();
  const { getToken } = useAuthIdentity();
  const {
    agentApiService,
    isLoaded,
    handleOAuthConnect,
    completeOnboardingFlow,
    isOnboarding,
  } = useAgentWorkspace();
  const handleBrandCreate = useAgentBrandCreate();
  const handleSkip = useCallback(async () => {
    setIsSkipping(true);
    setSkipError(null);
    try {
      await completeOnboardingFlow();
      push(orgHref('/workspace'));
    } catch {
      setSkipError('Could not finish setup. Please try again.');
      setIsSkipping(false);
    }
  }, [completeOnboardingFlow, orgHref, push]);

  const handleCreateFollowUpTasks = useCallback(
    async (taskId: string) => {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        throw new Error('Authentication token unavailable.');
      }

      const service = TasksService.getInstance(token);
      const createdTasks = await service.createChildTasks(taskId);

      return {
        createdCount: createdTasks.length,
      };
    },
    [getToken],
  );

  // `onSelectCreditPack` is drilled all the way down to `AgentChatMessage`
  // (now `React.memo`-wrapped, see #2517) for every message row. An inline
  // arrow here would be a fresh reference on every render of this shell,
  // defeating that memoization for the entire conversation history. Stabilize
  // both billing callbacks with `useCallback` for the same reason.
  const handleNavigateToBilling = useCallback(() => {
    push(orgHref('/settings/credits'));
  }, [push, orgHref]);

  const handleSelectCreditPack = useCallback(
    (pack: { label: string; price: string; credits: number }) => {
      push(orgHref(`/settings/credits?pack=${pack.label.toLowerCase()}`));
    },
    [push, orgHref],
  );

  // #4670 Open in Studio: the card already built the full, org-scoped Studio
  // generate URL (including the handoff id) via its own useOrgUrl() — this
  // just navigates, same as the billing callbacks above.
  const handleOpenInStudio = useCallback(
    (studioUrl: string) => {
      push(studioUrl);
    },
    [push],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      {isOnboarding ? (
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Genfeed"
                width={28}
                height={28}
                className="size-7 object-contain dark:invert"
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Genfeed</p>
              <p className="text-xs text-muted-foreground">
                Your first brand post
              </p>
            </div>
          </div>
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            onClick={() => void handleSkip()}
            isDisabled={isSkipping}
          >
            {isSkipping ? 'Opening workspace…' : 'Skip to workspace'}
          </Button>
        </header>
      ) : null}
      {skipError ? (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {skipError}
        </p>
      ) : null}
      <AgentFullPage
        apiService={agentApiService}
        authReady={isLoaded}
        onboardingMode={isOnboarding}
        onCreateFollowUpTasks={handleCreateFollowUpTasks}
        showThreadSidebar={false}
        threadId={threadId}
        onNavigateToBilling={handleNavigateToBilling}
        onOAuthConnect={handleOAuthConnect}
        onBrandCreate={handleBrandCreate}
        onOnboardingCompleted={completeOnboardingFlow}
        onOpenInStudio={handleOpenInStudio}
        onSelectCreditPack={handleSelectCreditPack}
      />
    </div>
  );
}
