'use client';

import { BrandProvider } from '@contexts/user/brand-context/brand-context';
import { UserProvider } from '@contexts/user/user-context/user-context';
import type { LayoutProps } from '@props/layout/layout.props';
import ApiStatusProvider from '@providers/api-status/api-status.provider';
import { ProtectedAuthGate } from '@providers/protected-providers/protected-providers';
import { ErrorBoundary } from '@ui/error';

export default function OnboardingSetupLayout({ children }: LayoutProps) {
  const content = (
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

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return content;
  }

  if (process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1') {
    return content;
  }

  return <ProtectedAuthGate>{content}</ProtectedAuthGate>;
}
