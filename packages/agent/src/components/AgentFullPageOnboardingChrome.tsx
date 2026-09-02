import { AgentOnboardingChecklist } from '@genfeedai/agent/components/AgentOnboardingChecklist';
import { isCloudDeployment } from '@genfeedai/config/deployment';
import { ButtonVariant } from '@genfeedai/contracts';
import type { OnboardingChecklistStep } from '@genfeedai/props/ui/agent/agent-onboarding.props';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@ui/primitives';
import { Button } from '@ui/primitives/button';
import { CircleCheck } from 'lucide-react';
import type { ReactElement } from 'react';

type AgentFullPageOnboardingChromeProps = {
  completionPercent: number;
  currentStepId: string | undefined;
  earnedCredits: number;
  signupGiftCredits: number;
  steps: OnboardingChecklistStep[];
  totalOnboardingCreditsVisible: number;
  totalJourneyCredits: number;
  mobileChecklistOpen: boolean;
  onMobileChecklistOpenChange: (open: boolean) => void;
};

export function AgentFullPageOnboardingChrome({
  completionPercent,
  currentStepId,
  earnedCredits,
  signupGiftCredits,
  steps,
  totalOnboardingCreditsVisible,
  totalJourneyCredits,
  mobileChecklistOpen,
  onMobileChecklistOpenChange,
}: AgentFullPageOnboardingChromeProps): ReactElement {
  // Managed credits are cloud-only, so a self-hosted operator earns nothing
  // from the journey and must not be shown a reward economy. Resolved once
  // here so both the sidebar and the mobile drawer stay consistent.
  const isCreditRewardsVisible = isCloudDeployment();

  return (
    <>
      {/* Desktop sidebar */}
      <div className="w-80 shrink-0 border-l border-foreground/[0.06] max-md:hidden">
        <AgentOnboardingChecklist
          completionPercent={completionPercent}
          currentStepId={currentStepId}
          earnedCredits={earnedCredits}
          isCreditRewardsVisible={isCreditRewardsVisible}
          signupGiftCredits={signupGiftCredits}
          steps={steps}
          totalOnboardingCreditsVisible={totalOnboardingCreditsVisible}
          totalJourneyCredits={totalJourneyCredits}
        />
      </div>

      {/* Mobile bottom bar + drawer */}
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-foreground/[0.06] bg-background/95 px-4 py-3 backdrop-blur-sm md:hidden"
        onClick={() => onMobileChecklistOpenChange(true)}
      >
        <div className="flex items-center gap-2">
          <CircleCheck className="size-5 text-primary" />
          <span className="text-sm font-medium text-foreground">
            Activation Journey
          </span>
        </div>
        {isCreditRewardsVisible ? (
          <span className="text-xs text-muted-foreground">
            {earnedCredits}/{totalJourneyCredits} credits
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {steps.filter((step) => step.status === 'complete').length}/
            {steps.length} done
          </span>
        )}
      </Button>

      <Drawer
        open={mobileChecklistOpen}
        onOpenChange={onMobileChecklistOpenChange}
      >
        <DrawerContent className="max-h-[70vh]">
          <DrawerHeader>
            <DrawerTitle>Activation Journey</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-1 pb-6">
            <AgentOnboardingChecklist
              completionPercent={completionPercent}
              currentStepId={currentStepId}
              earnedCredits={earnedCredits}
              isCreditRewardsVisible={isCreditRewardsVisible}
              signupGiftCredits={signupGiftCredits}
              steps={steps}
              totalOnboardingCreditsVisible={totalOnboardingCreditsVisible}
              totalJourneyCredits={totalJourneyCredits}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
