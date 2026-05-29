import { AgentOnboardingChecklist } from '@genfeedai/agent/components/AgentOnboardingChecklist';
import { ButtonVariant } from '@genfeedai/enums';
import type { OnboardingChecklistStep } from '@genfeedai/props/ui/agent/agent-onboarding.props';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@ui/primitives';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { HiOutlineCheckCircle } from 'react-icons/hi2';

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
  return (
    <>
      {/* Desktop sidebar */}
      <div className="w-80 shrink-0 border-l border-white/[0.06] max-md:hidden">
        <AgentOnboardingChecklist
          completionPercent={completionPercent}
          currentStepId={currentStepId}
          earnedCredits={earnedCredits}
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
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-white/[0.06] bg-background/95 px-4 py-3 backdrop-blur-sm md:hidden"
        onClick={() => onMobileChecklistOpenChange(true)}
      >
        <div className="flex items-center gap-2">
          <HiOutlineCheckCircle className="size-5 text-primary" />
          <span className="text-sm font-medium text-foreground">
            Activation Journey
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {earnedCredits}/{totalJourneyCredits} credits
        </span>
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
