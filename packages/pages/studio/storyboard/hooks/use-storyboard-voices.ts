'use client';

import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useEffect, useState } from 'react';

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

export function useStoryboardVoices(brandId: string, organizationId: string) {
  const { userId, sessionId } = useAuthIdentity();
  const getService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );
  const scope = JSON.stringify([
    EnvironmentService.apiEndpoint,
    globalThis.__GENFEED_DESKTOP_ENV__?.authEndpoint,
    userId,
    sessionId,
    organizationId,
    brandId,
  ]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    scope: string;
    status: 'loading' | 'loaded' | 'failed';
    voices: IIngredient[];
    error?: string;
  }>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is an explicit scoped retry.
  useEffect(() => {
    const controller = new AbortController();
    setResult({ scope, status: 'loading', voices: [] });
    if (brandId && organizationId)
      void getService()
        .then((service) => {
          if (controller.signal.aborted) return [];
          return service.findAllPages(
            {
              category: IngredientCategory.VOICE,
              status: statuses,
              organizationId,
              isDeleted: false,
            },
            controller.signal,
          );
        })
        .then((voices) => {
          if (!controller.signal.aborted)
            setResult({
              scope,
              status: 'loaded',
              voices: eligibleStoryboardVoices(voices, organizationId, brandId),
            });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setResult({
              scope,
              status: 'failed',
              voices: [],
              error: getJsonApiErrorMessage(
                error,
                'Could not load saved voices.',
              ),
            });
        });
    return () => controller.abort();
  }, [scope, brandId, organizationId, getService, attempt]);
  return {
    voices: result?.scope === scope ? result.voices : [],
    status: result?.scope === scope ? result.status : ('loading' as const),
    error: result?.scope === scope ? result.error : undefined,
    retry: () => setAttempt((value) => value + 1),
  };
}
