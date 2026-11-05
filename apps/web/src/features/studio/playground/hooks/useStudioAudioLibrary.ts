'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { AgentContentMentionItem } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { loadStudioAudioLibrary } from '@/features/studio/playground/utils/studio-audio-library';

const EMPTY_ITEMS: readonly AgentContentMentionItem[] = [];

/**
 * The brand's ready audio, read while the audio picker is open. The read is
 * cached per brand, organization, session and API, so reopening the picker
 * paints the last list at once and refreshes it in the background; another
 * scope never sees it, and a superseded read is cancelled.
 */
export function useStudioAudioLibrary(isEnabled: boolean) {
  const { brandId, organizationId } = useBrand();
  const { sessionId } = useAuthIdentity();

  const query = useAuthedQuery<IngredientsService, AgentContentMentionItem[]>({
    enabled: Boolean(isEnabled && brandId && organizationId),
    queryFn: async (service, signal) => {
      try {
        return await loadStudioAudioLibrary(
          service,
          brandId,
          organizationId,
          signal,
        );
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load Studio audio references', error);
        }
        throw error;
      }
    },
    queryKey: [
      'studio-audio-library',
      brandId,
      organizationId,
      sessionId ?? null,
      EnvironmentService.apiEndpoint,
    ],
    service: (token: string) => IngredientsService.getInstance(token),
  });

  if (!isEnabled) {
    return { hasError: false, isLoading: false, items: EMPTY_ITEMS };
  }

  return {
    hasError: query.isError,
    isLoading: query.isLoading,
    // A failed read never leaves older items on screen.
    items: query.isError ? EMPTY_ITEMS : (query.data ?? EMPTY_ITEMS),
  };
}
