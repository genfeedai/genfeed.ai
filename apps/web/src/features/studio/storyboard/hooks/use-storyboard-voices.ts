'use client';

import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useCallback } from 'react';

const EMPTY_VOICES: IIngredient[] = [];

const statuses = [
  IngredientStatus.UPLOADED,
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

export function eligibleStoryboardVoices(
  rows: IIngredient[],
  organizationId: string,
  brandId: string,
) {
  return rows.filter((voice) => {
    const organization =
      voice.organizationId ??
      (typeof voice.organization === 'string'
        ? voice.organization
        : voice.organization?.id);
    const brand =
      voice.brandId !== undefined
        ? voice.brandId
        : typeof voice.brand === 'string'
          ? voice.brand
          : voice.brand?.id;
    const globalBrand = voice.brandId === null || voice.brand === null;
    return (
      voice.category === IngredientCategory.VOICE &&
      !voice.isDeleted &&
      organization === organizationId &&
      (globalBrand || brand === brandId) &&
      statuses.includes(voice.status)
    );
  });
}

/**
 * The saved voices a storyboard can use. The list is cached per organization,
 * brand, session and API, so reopening the plan paints the last list at once
 * and refreshes it in the background; another scope never sees it.
 */
export function useStoryboardVoices(brandId: string, organizationId: string) {
  const { sessionId } = useAuthIdentity();
  const query = useAuthedQuery<IngredientsService, IIngredient[]>({
    enabled: Boolean(brandId && organizationId),
    queryFn: async (service, signal) => {
      // A read superseded while it waited for its token never reaches the API.
      signal.throwIfAborted();
      const voices = await service.findAllPages(
        {
          category: IngredientCategory.VOICE,
          status: statuses,
          organizationId,
          isDeleted: false,
        },
        signal,
      );
      return eligibleStoryboardVoices(voices, organizationId, brandId);
    },
    queryKey: [
      'storyboard-voices',
      organizationId,
      brandId,
      sessionId ?? null,
      EnvironmentService.apiEndpoint,
      globalThis.__GENFEED_DESKTOP_ENV__?.authEndpoint ?? null,
    ],
    service: (token: string) => IngredientsService.getInstance(token),
  });
  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const status: 'loading' | 'loaded' | 'failed' = query.isError
    ? 'failed'
    : query.data
      ? 'loaded'
      : 'loading';

  return {
    // A failed read never leaves older voices beside its error.
    voices: query.isError ? EMPTY_VOICES : (query.data ?? EMPTY_VOICES),
    status,
    error: query.error
      ? getJsonApiErrorMessage(query.error, 'Could not load saved voices.')
      : undefined,
    retry,
  };
}
