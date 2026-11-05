'use client';

import { PersonasService } from '@genfeedai/services/content/personas.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { isCancelledRequest } from '@genfeedai/services/core/operation-error';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import type { LibraryCharacterOption } from '@/features/library/props/library-browser.props';

const NO_OPTIONS: LibraryCharacterOption[] = [];

/**
 * The characters the active brand can use, for the Library character filter.
 * Availability is decided server-side (own brand plus shared to it), so the
 * list is exactly what the filter will honour. The list is cached per brand:
 * returning to the Library paints it at once, and the previous brand's
 * characters are never shown while the next brand loads.
 */
export function useLibraryCharacterOptions({
  brandId,
  isEnabled,
}: {
  brandId?: string | null;
  isEnabled: boolean;
}): LibraryCharacterOption[] {
  const optionsQuery = useAuthedQuery<
    PersonasService,
    LibraryCharacterOption[]
  >({
    enabled: isEnabled && Boolean(brandId),
    queryFn: async (service, signal) => {
      try {
        const characters = await service.listAllCharacters({
          brandId: brandId ?? undefined,
          signal,
        });
        return characters.map((character) => ({
          avatarIngredientId: character.avatarIngredientId,
          id: character.id,
          label: character.label,
        }));
      } catch (error) {
        if (!signal.aborted && !isCancelledRequest(error)) {
          logger.error('Failed to load Library character filter options', {
            error,
          });
        }
        throw error;
      }
    },
    queryKey: ['library-character-options', brandId ?? null],
    service: (token: string) => PersonasService.getInstance(token),
  });

  return isEnabled && brandId ? (optionsQuery.data ?? NO_OPTIONS) : NO_OPTIONS;
}
