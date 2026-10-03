'use client';

import { PersonasService } from '@genfeedai/services/content/personas.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { isCancelledRequest } from '@genfeedai/services/core/operation-error';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { LibraryCharacterOption } from '@props/pages/library-browser.props';
import { useEffect, useState } from 'react';

/**
 * The characters the active brand can use, for the Library character filter.
 * Availability is decided server-side (own brand plus shared to it), so the
 * list is exactly what the filter will honour.
 */
export function useLibraryCharacterOptions({
  brandId,
  isEnabled,
}: {
  brandId?: string | null;
  isEnabled: boolean;
}): LibraryCharacterOption[] {
  const getPersonasService = useAuthedService((token: string) =>
    PersonasService.getInstance(token),
  );
  const [options, setOptions] = useState<LibraryCharacterOption[]>([]);

  useEffect(() => {
    if (!isEnabled || !brandId) {
      setOptions([]);
      return;
    }

    // Never show the previous brand's characters while the next brand loads.
    setOptions([]);
    const abortController = new AbortController();

    async function load(): Promise<void> {
      try {
        const service = await getPersonasService();
        const characters = await service.listAllCharacters({
          brandId,
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) {
          return;
        }

        setOptions(
          characters.map((character) => ({
            avatarIngredientId: character.avatarIngredientId,
            id: character.id,
            label: character.label,
          })),
        );
      } catch (error) {
        if (abortController.signal.aborted || isCancelledRequest(error)) {
          return;
        }

        logger.error('Failed to load Library character filter options', {
          error,
        });
        setOptions([]);
      }
    }

    void load();

    return () => {
      abortController.abort();
    };
  }, [brandId, getPersonasService, isEnabled]);

  return options;
}
