'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useVisiblePolling } from '@genfeedai/hooks/ui/use-visible-polling/use-visible-polling';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import {
  OnboardingService,
  type ProactiveWorkspaceResponse,
} from '@services/onboarding/onboarding.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
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
  const { getToken } = useAuthIdentity();
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

  // The workspace is claimed once and then polled; both paths must stop
  // dispatching once the wizard step unmounts.
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadWorkspace = useCallback(
    async (mode: 'claim' | 'refresh', signal?: AbortSignal) => {
      const isStale = (): boolean =>
        !isMountedRef.current || signal?.aborted === true;
      const token = await resolveAuthToken(getToken);
      if (!token) {
        return;
      }

      const service = OnboardingService.getInstance(token);

      try {
        const result =
          mode === 'claim'
            ? await service.claimProactiveWorkspace(signal)
            : await service.getProactiveWorkspace(signal);

        if (!isStale()) {
          if (mode === 'claim') {
            dispatch({ type: 'LOAD_SUCCESS', payload: result });
          } else {
            dispatch({ type: 'REFRESH_SUCCESS', payload: result });
          }
        }
      } catch (loadError) {
        if (mode === 'claim') {
          try {
            const fallback = await service.getProactiveWorkspace(signal);
            if (!isStale()) {
              dispatch({ type: 'LOAD_SUCCESS', payload: fallback });
            }
            return;
          } catch {
            // fall through to shared error path
          }
        }

        if (!isStale()) {
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
    },
    [getToken],
  );

  // `loadWorkspace` changes whenever the auth token context does, which re-runs
  // this effect. Without an effect-scoped signal the superseded claim stays in
  // flight and its late result overwrites the newer workspace state.
  useEffect(() => {
    const controller = new AbortController();

    void loadWorkspace('claim', controller.signal)
      .catch(() => undefined)
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) {
          dispatch({ type: 'LOAD_DONE' });
        }
      });

    return () => {
      controller.abort();
    };
  }, [loadWorkspace]);

  // One poll at a time: a tick that fires while the previous refresh is still
  // in flight supersedes it, and unmount cancels whatever is left.
  const refreshControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      refreshControllerRef.current?.abort();
    };
  }, []);

  const refreshWorkspace = useCallback(() => {
    refreshControllerRef.current?.abort();

    const controller = new AbortController();
    refreshControllerRef.current = controller;

    dispatch({ type: 'REFRESH_START' });
    void loadWorkspace('refresh', controller.signal)
      .catch(() => undefined)
      .finally(() => {
        if (isMountedRef.current && !controller.signal.aborted) {
          dispatch({ type: 'REFRESH_DONE' });
        }
      });
  }, [loadWorkspace]);

  useVisiblePolling(refreshWorkspace, { intervalMs: POLL_INTERVAL_MS });

  if (isLoading) {
    return (
      <div className="space-y-8" data-testid="proactive-workspace-loading">
        <SkeletonCard showImage={false} />
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <SkeletonCard showImage={false} />
          <SkeletonCard showImage={false} />
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <ProactiveErrorState
        error={error}
        onContinueSelfServe={() => push(APP_ROUTES.ONBOARDING.BRAND)}
      />
    );
  }

  return (
    <div className="space-y-8">
      <ProactiveHeroCard
        workspace={workspace}
        statusLabel={statusLabel}
        isRefreshing={isRefreshing}
        onConfigureProviders={() => push(APP_ROUTES.ONBOARDING.PROVIDERS)}
        onContinueSelfServe={() => push(APP_ROUTES.ONBOARDING.BRAND)}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <ProactiveOutputsCard outputs={workspace.outputs} />
        <ProactiveWorkspaceSidebar workspace={workspace} />
      </div>
    </div>
  );
}
