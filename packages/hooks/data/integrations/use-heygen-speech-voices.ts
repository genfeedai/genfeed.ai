'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { HeyGenSpeechVoice } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { useCallback, useEffect, useState } from 'react';

const LOAD_ERROR_MESSAGE =
  'HeyGen Voice voices could not be loaded. Retry or check your connection in Integrations.';

interface HeyGenSpeechVoicesState {
  hasPersonalConnection: boolean;
  organizationId: string;
  voices: readonly HeyGenSpeechVoice[];
}

export interface UseHeyGenSpeechVoicesOptions {
  /** Fetch only while a surface that speaks with HeyGen Voice is active. */
  isEnabled?: boolean;
}

export interface UseHeyGenSpeechVoicesReturn {
  error: string | null;
  hasPersonalConnection: boolean;
  /** True once a fetch for the current organization succeeded. */
  isLoaded: boolean;
  isLoading: boolean;
  retry: () => void;
  voices: readonly HeyGenSpeechVoice[];
}

/**
 * HeyGen Voice (text-to-speech) voices: the workspace's own ACTIVE clones,
 * listed only when it has connected its own HeyGen account. A failed load leaves `voices` empty and
 * `isLoaded` false so callers degrade to other providers' voices.
 */
export function useHeyGenSpeechVoices({
  isEnabled = true,
}: UseHeyGenSpeechVoicesOptions = {}): UseHeyGenSpeechVoicesReturn {
  const { organizationId } = useBrand();
  const getService = useAuthedService((token: string) =>
    HeyGenService.getInstance(token),
  );
  const [state, setState] = useState<HeyGenSpeechVoicesState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount explicitly requests a fresh load.
  useEffect(() => {
    if (!isEnabled || !organizationId) {
      setIsLoading(false);
      return;
    }

    const loadingOrganizationId: string = organizationId;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    async function load() {
      try {
        const service = await getService();
        if (controller.signal.aborted) return;
        const catalog = await service.fetchSpeechVoices(controller.signal);
        if (controller.signal.aborted) return;
        setState({
          hasPersonalConnection: catalog.hasPersonalConnection,
          organizationId: loadingOrganizationId,
          voices: catalog.voices,
        });
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (caught instanceof Error && caught.name === 'AbortError') return;
        setState(null);
        setError(LOAD_ERROR_MESSAGE);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [getService, isEnabled, organizationId, retryCount]);

  // A previous organization's catalog must never serve the current one.
  const current =
    isEnabled && state?.organizationId === organizationId ? state : null;

  return {
    error: isEnabled ? error : null,
    hasPersonalConnection: current?.hasPersonalConnection ?? false,
    isLoaded: current !== null,
    isLoading: isEnabled && isLoading,
    retry,
    voices: current?.voices ?? [],
  };
}
