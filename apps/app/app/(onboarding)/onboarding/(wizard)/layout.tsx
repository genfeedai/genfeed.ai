'use client';

import OnboardingProgress from '@app/(onboarding)/onboarding/components/onboarding-progress';
import OnboardingProvider, {
  useOnboarding,
} from '@contexts/onboarding/onboarding-context';
import { ONBOARDING_STEPS } from '@genfeedai/constants';
import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import type { LayoutProps } from '@props/layout/layout.props';
import { EnvironmentService } from '@services/core/environment.service';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function OnboardingLayoutInner({ children }: LayoutProps) {
  const { currentStepIndex, stepLabels } = useOnboarding();
  const logoUrl = useThemeLogo();
  const pathname = usePathname();

  // Hide progress bar on success page (not a counted step)
  const segment = pathname.split('/').pop();
  const isCountedStep =
    !!segment && (ONBOARDING_STEPS as readonly string[]).includes(segment);
  const showCloudFooter = isCountedStep && segment !== 'summary';

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-12">
          {logoUrl && (
            <Image
              src={logoUrl}
              alt={EnvironmentService.LOGO_ALT}
              className="h-8 w-8 object-contain invert"
              width={32}
              height={32}
              sizes="32px"
              priority
            />
          )}
          <span className="text-white/80 font-semibold text-lg tracking-tight">
            Genfeed
          </span>
        </div>

        {/* Progress — only on counted steps (brand, plan) */}
        <div className="max-w-4xl mx-auto">
          {isCountedStep ? (
            <OnboardingProgress
              currentStep={currentStepIndex}
              totalSteps={stepLabels.length}
              stepLabels={stepLabels}
            />
          ) : null}

          {/* Step content */}
          <div className="mt-12">{children}</div>

          {showCloudFooter ? (
            <p className="mt-8 text-sm text-white/30">
              Don&apos;t know what you&apos;re looking for?{' '}
              <Link
                href={EnvironmentService.apps.website}
                className="text-white/65 underline decoration-white/20 underline-offset-4 transition hover:text-white"
              >
                Use our cloud solution instead.
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingLayout({ children }: LayoutProps) {
  return (
    <OnboardingProvider>
      <OnboardingLayoutInner>{children}</OnboardingLayoutInner>
    </OnboardingProvider>
  );
}
