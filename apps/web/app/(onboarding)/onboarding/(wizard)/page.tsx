'use client';

import { useUser } from '@clerk/nextjs';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Root /onboarding page — redirects to the dedicated onboarding chat route.
 * The agent-driven conversational UI replaces the old wizard flow.
 */
export default function OnboardingRootPage() {
  const { currentUser, isLoading } = useCurrentUser();
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !currentUser || !isClerkLoaded) {
      return;
    }

    if (currentUser.isOnboardingCompleted) {
      router.replace('/');
      return;
    }

    if (clerkUser?.publicMetadata?.proactiveLeadId) {
      router.replace('/onboarding/proactive');
      return;
    }

    router.replace('/chat/onboarding');
  }, [isLoading, currentUser, isClerkLoaded, clerkUser, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}
