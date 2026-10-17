'use client';

import { PersonasService } from '@genfeedai/services/content/personas.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import CharacterReferenceUsageNotice from '@ui/characters/CharacterReferenceUsageNotice';
import { createElement, type ReactNode, useCallback, useRef } from 'react';

/**
 * Looks up which characters keep the assets as reference images, so a delete
 * confirm can name them. Resolves to nothing when no character uses the
 * assets or the lookup fails, which leaves the standard confirm in place.
 * Resolves to `null` when an earlier lookup is still running: the caller
 * drops that call, so a double click opens one confirm, not two.
 */
export function useCharacterReferenceDeleteWarning(): (
  ingredientIds: string[],
) => Promise<ReactNode | undefined | null> {
  const getPersonasService = useAuthedService((token: string) =>
    PersonasService.getInstance(token),
  );

  const isLookingUpRef = useRef(false);

  return useCallback(
    async (ingredientIds: string[]) => {
      if (ingredientIds.length === 0) {
        return undefined;
      }

      if (isLookingUpRef.current) {
        return null;
      }
      isLookingUpRef.current = true;

      try {
        const service = await getPersonasService();
        const usage = (await service.findReferenceUsage(ingredientIds)).filter(
          (entry) => entry.characters.length > 0,
        );

        return usage.length > 0
          ? createElement(CharacterReferenceUsageNotice, { usage })
          : undefined;
      } catch (error) {
        logger.warn('Character reference usage lookup failed', error);
        return undefined;
      } finally {
        isLookingUpRef.current = false;
      }
    },
    [getPersonasService],
  );
}
