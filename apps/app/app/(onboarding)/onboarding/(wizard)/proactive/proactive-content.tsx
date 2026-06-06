'use client';

import { useAuth } from '@clerk/nextjs';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import {
  OnboardingService,
  type ProactiveWorkspaceResponse,
} from '@services/onboarding/onboarding.service';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import ProactiveErrorState from './proactive-error-state';
import ProactiveHeroCard from './proactive-hero-card';
import ProactiveOutputsCard from './proactive-outputs-card';
import ProactiveWorkspaceSidebar from './proactive-workspace-sidebar';

const POLL_INTERVAL_MS = 8000;

export default function ProactiveContent() {
  const { push } = useRouter();
  const { getToken } = useAuth();
  const [workspace, setWorkspace] = useState<ProactiveWorkspaceResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = useMemo(() => {
    if (!workspace) {
      return 'Preparing your workspace';
    }

    return `${workspace.prepPercent}% ready`;
  }, [workspace]);

  useEffect(() => {
    let isCancelled = false;

    const loadWorkspace = async (mode: 'claim' | 'refresh') => {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        return;
      }

      const service = OnboardingService.getInstance(token);

      try {
        const result =
          mode === 'claim'
            ? await service.claimProactiveWorkspace()
            : await service.getProactiveWorkspace();

        if (!isCancelled) {
          setWorkspace(result);
          setError(null);
        }
      } catch (loadError) {
        if (mode === 'claim') {
          try {
            const fallback = await service.getProactiveWorkspace();
            if (!isCancelled) {
              setWorkspace(fallback);
              setError(null);
            }
            return;
          } catch {
            // fall through to shared error path
          }
        }

        if (!isCancelled) {
          setError('We could not load your prepared workspace.');
          toast.error('Unable to load proactive onboarding.');
        }
        throw loadError;
      }
    };

    void loadWorkspace('claim')
      .catch(() => undefined)
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    const intervalId = window.setInterval(() => {
      setIsRefreshing(true);
      void loadWorkspace('refresh')
        .catch(() => undefined)
        .finally(() => {
          if (!isCancelled) {
            setIsRefreshing(false);
          }
        });
    }, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [getToken]);

  if (isLoading) {
    return <PageLoadingState />;
  }

  if (!workspace) {
    return (
      <ProactiveErrorState
        error={error}
        onContinueSelfServe={() => push('/onboarding/brand')}
      />
    );
  }

  return (
    <div className="space-y-8">
      <ProactiveHeroCard
        workspace={workspace}
        statusLabel={statusLabel}
        isRefreshing={isRefreshing}
        onConfigureProviders={() => push('/onboarding/providers')}
        onContinueSelfServe={() => push('/onboarding/brand')}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <ProactiveOutputsCard outputs={workspace.outputs} />
        <ProactiveWorkspaceSidebar workspace={workspace} />
      </div>
    </div>
  );
}
