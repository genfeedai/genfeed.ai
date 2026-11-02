'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { HeyGenSpeechVoice } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { HeyGenService } from '@services/ingredients/heygen.service';
import { useCallback } from 'react';

const LOAD_ERROR_MESSAGE =
  'HeyGen Voice voices could not be loaded. Retry or check your connection in Integrations.';

const EMPTY_VOICES: readonly HeyGenSpeechVoice[] = [];

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
  // The organization is in the key, so a previous organization's catalog never
  // serves the current one, and coming back to a voice surface paints the
  // cached catalog while it refreshes.
  const query = useAuthedQuery({
    enabled: isEnabled && Boolean(organizationId),
    queryFn: (service, signal) => service.fetchSpeechVoices(signal),
    queryKey: ['heygen', 'speech-voices', organizationId ?? null],
    service: (token: string) => HeyGenService.getInstance(token),
  });
  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // A failed read degrades to "no HeyGen voices" so callers fall back to other
  // providers' voices.
  const catalog = isEnabled && !query.isError ? query.data : undefined;

  return {
    error: isEnabled && query.isError ? LOAD_ERROR_MESSAGE : null,
    hasPersonalConnection: catalog?.hasPersonalConnection ?? false,
    isLoaded: catalog !== undefined,
    isLoading: isEnabled && query.isLoading,
    retry,
    voices: catalog?.voices ?? EMPTY_VOICES,
  };
}
