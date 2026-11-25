'use client';

import OnboardingFrame from '@app/(onboarding)/onboarding/components/onboarding-frame';
import OnboardingProgress from '@app/(onboarding)/onboarding/components/onboarding-progress';
import OnboardingProvider, {
  useOnboarding,
} from '@contexts/onboarding/onboarding-context';
import { hasSingleStepOnboarding } from '@genfeedai/config/deployment';
import type { LayoutProps } from '@props/layout/layout.props';
import { EnvironmentService } from '@services/core/environment.service';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function OnboardingLayoutInner({ children }: LayoutProps) {
  const { currentStepIndex, stepLabels, steps } = useOnboarding();
  const pathname = usePathname();

  // Hide progress bar on success page (not a counted step)
  const segment = pathname.split('/').pop();
  const isCountedStep =
    !!segment && (steps as readonly string[]).includes(segment);
  const isBrandSetup = segment === 'brand';
  const showCloudFooter =
    isCountedStep && segment !== 'summary' && !isBrandSetup;

  if (isBrandSetup && hasSingleStepOnboarding()) return children;

  return (
    <OnboardingFrame
      contentClassName={isBrandSetup ? 'mt-6' : 'mt-12'}
      footer={
        showCloudFooter ? (
          <p className="mt-8 text-sm text-muted-foreground">
            Don&apos;t know what you&apos;re looking for?{' '}
            <Link
              href={EnvironmentService.apps.website}
              className="text-muted-foreground underline decoration-border-strong underline-offset-4 transition hover:text-foreground"
            >
              Use our cloud solution instead.
            </Link>
          </p>
        ) : null
      }
      progress={
        // Progress — only on counted steps (brand, plan)
        isCountedStep && !isBrandSetup ? (
          <OnboardingProgress
            currentStep={currentStepIndex}
            totalSteps={stepLabels.length}
            stepLabels={stepLabels}
          />
        ) : null
      }
    >
      {children}
    </OnboardingFrame>
  );
}

export default function OnboardingLayout({ children }: LayoutProps) {
  return (
    <OnboardingProvider>
      <OnboardingLayoutInner>{children}</OnboardingLayoutInner>
    </OnboardingProvider>
  );
}
