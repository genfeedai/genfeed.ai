'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSettingsStore } from '@/store/settingsStore';
import { setupApi } from '@/lib/api/setup';
import { logger } from '@/lib/logger';

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function checkSetup() {
      const hasSeenWelcome = useSettingsStore.getState().hasSeenWelcome;

      // Already completed onboarding locally — skip check
      if (hasSeenWelcome) {
        setIsReady(true);
        return;
      }

      // Check if server is already configured (e.g. .env has REPLICATE_API_TOKEN)
      try {
        const status = await setupApi.getStatus(controller.signal);

        if (status.hasCompletedSetup) {
          // Server has a key — mark onboarding done locally and skip
          useSettingsStore.getState().setHasSeenWelcome(true);
          setIsReady(true);
          return;
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // If API is unreachable, don't block the app — let user through
        logger.error('Failed to check setup status', error, { context: 'OnboardingGuard' });
        setIsReady(true);
        return;
      }

      // Not set up — redirect to onboarding
      if (pathname !== '/onboarding') {
        router.replace('/onboarding');
        return;
      }

      setIsReady(true);
    }

    checkSetup();
    return () => controller.abort();
  }, [pathname, router]);

  if (!isReady) return null;

  return <>{children}</>;
}

export { OnboardingGuard };
