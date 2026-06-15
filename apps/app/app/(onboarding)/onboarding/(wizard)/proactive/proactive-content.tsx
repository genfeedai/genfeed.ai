'use client';

import { useAuth } from '@clerk/nextjs';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import {
  OnboardingService,
  type ProactiveWorkspaceResponse,
} from '@services/onboarding/onboarding.service';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useReducer } from 'react';
import { toast } from 'sonner';
import ProactiveErrorState from './proactive-error-state';
import ProactiveHeroCard from './proactive-hero-card';
import ProactiveOutputsCard from './proactive-outputs-card';
import ProactiveWorkspaceSidebar from './proactive-workspace-sidebar';

const POLL_INTERVAL_MS = 8000;

type WorkspaceState = {
  workspace: ProactiveWorkspaceResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
};

type WorkspaceAction =
  | { type: 'LOAD_SUCCESS'; payload: ProactiveWorkspaceResponse }
  | { type: 'LOAD_ERROR'; payload: string }
  | { type: 'LOAD_DONE' }
  | { type: 'REFRESH_START' }
  | { type: 'REFRESH_SUCCESS'; payload: ProactiveWorkspaceResponse }
  | { type: 'REFRESH_DONE' };

const initialState: WorkspaceState = {
  workspace: null,
  isLoading: true,
  isRefreshing: false,
  error: null,
};

function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case 'LOAD_SUCCESS':
      return {
        ...state,
        workspace: action.payload,
        isLoading: false,
        error: null,
      };
    case 'LOAD_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'LOAD_DONE':
      return { ...state, isLoading: false };
    case 'REFRESH_START':
      return { ...state, isRefreshing: true };
    case 'REFRESH_SUCCESS':
      return {
        ...state,
        workspace: action.payload,
        isRefreshing: false,
        error: null,
      };
    case 'REFRESH_DONE':
      return { ...state, isRefreshing: false };
    default:
      return state;
  }
}

export default function ProactiveContent() {
  const { push } = useRouter();
  const { getToken } = useAuth();
  const [{ workspace, isLoading, isRefreshing, error }, dispatch] = useReducer(
    workspaceReducer,
    initialState,
  );

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
          if (mode === 'claim') {
            dispatch({ type: 'LOAD_SUCCESS', payload: result });
          } else {
            dispatch({ type: 'REFRESH_SUCCESS', payload: result });
          }
        }
      } catch (loadError) {
        if (mode === 'claim') {
          try {
            const fallback = await service.getProactiveWorkspace();
            if (!isCancelled) {
              dispatch({ type: 'LOAD_SUCCESS', payload: fallback });
            }
            return;
          } catch {
            // fall through to shared error path
          }
        }

        if (!isCancelled) {
          if (mode === 'claim') {
            dispatch({
              type: 'LOAD_ERROR',
              payload: 'We could not load your prepared workspace.',
            });
          }
          toast.error('Unable to load proactive onboarding.');
        }
        throw loadError;
      }
    };

    void loadWorkspace('claim')
      .catch(() => undefined)
      .finally(() => {
        if (!isCancelled) {
          dispatch({ type: 'LOAD_DONE' });
        }
      });

    const intervalId = window.setInterval(() => {
      dispatch({ type: 'REFRESH_START' });
      void loadWorkspace('refresh')
        .catch(() => undefined)
        .finally(() => {
          if (!isCancelled) {
            dispatch({ type: 'REFRESH_DONE' });
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
