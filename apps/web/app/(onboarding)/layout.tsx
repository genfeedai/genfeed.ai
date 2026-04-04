'use client';

import { BrandProvider } from '@contexts/user/brand-context/brand-context';
import { UserProvider } from '@contexts/user/user-context/user-context';
import type { LayoutProps } from '@props/layout/layout.props';
import ApiStatusProvider from '@providers/api-status/api-status.provider';
import { ErrorBoundary } from '@ui/error';

export default function OnboardingSetupLayout({ children }: LayoutProps) {
  return (
    <ApiStatusProvider>
      <UserProvider>
        <BrandProvider>
          <ErrorBoundary
            title="Onboarding Error"
            description="Something went wrong during setup. Please try again."
          >
            {children}
          </ErrorBoundary>
        </BrandProvider>
      </UserProvider>
    </ApiStatusProvider>
  );
}
