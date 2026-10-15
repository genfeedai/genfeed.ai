import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { IngredientCategory } from '@genfeedai/contracts';
import { MAX_CHARACTER_REFERENCES } from '@genfeedai/contracts/constants';
import type { CharacterReferenceItem } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  CharacterReferencesControls,
  UseCharacterReferencesOptions,
} from '@props/characters/characters-page.props';
import { PersonasService } from '@services/content/personas.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';

export function useCharacterReferences({
  character,
  onChanged,
}: UseCharacterReferencesOptions): CharacterReferencesControls {
  const translate = useTranslations('common.settings.characters');
  const { openGallery } = useGalleryModal();
  const getPersonasService = useAuthedService((token: string) =>
    PersonasService.getInstance(token),
  );
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);
  const referenceIds = character.referenceIngredientIds;
  const isFull = referenceIds.length >= MAX_CHARACTER_REFERENCES;

  const run = useCallback(
    async (
      request: (service: PersonasService) => Promise<CharacterReferenceItem[]>,
      errorKey: 'addFailed' | 'removeFailed' | 'reorderFailed',
    ) => {
      if (isBusyRef.current) {
        return;
      }
      isBusyRef.current = true;
      setIsBusy(true);
      try {
        const references = await request(await getPersonasService());
        onChanged(references);
      } catch (error: unknown) {
        logger.error('Failed to update character references', error);
        notificationsService.error(translate(`references.${errorKey}`));
      } finally {
        isBusyRef.current = false;
        setIsBusy(false);
      }
    },
    [getPersonasService, notificationsService, onChanged, translate],
  );

  const move = useCallback(
    async (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= referenceIds.length) {
        return;
      }
      const next = [...referenceIds];
      const [moved] = next.splice(index, 1);
      if (moved === undefined) {
        return;
      }
      next.splice(target, 0, moved);
      await run(
        (service) => service.reorderReferences(character.id, next),
        'reorderFailed',
      );
    },
    [character.id, referenceIds, run],
  );

  const remove = useCallback(
    async (ingredientId: string) => {
      if (referenceIds.length <= 1) {
        return;
      }
      await run(
        (service) => service.removeReference(character.id, ingredientId),
        'removeFailed',
      );
    },
    [character.id, referenceIds.length, run],
  );

  const add = useCallback(() => {
    const remaining = MAX_CHARACTER_REFERENCES - referenceIds.length;
    if (remaining <= 0) {
      notificationsService.warning(
        translate('references.limit', { max: MAX_CHARACTER_REFERENCES }),
      );
      return;
    }
    openGallery({
      category: IngredientCategory.IMAGE,
      maxSelectableItems: remaining,
      onSelect: (items) => {
        const selected = items
          .filter((item) => !item.isDeleted)
          .map((item) => item.id)
          .filter((id) => !referenceIds.includes(id));
        if (selected.length === 0) {
          return;
        }
        if (selected.length > remaining) {
          notificationsService.warning(
            translate('references.limit', { max: MAX_CHARACTER_REFERENCES }),
          );
          return;
        }
        void run(
          (service) => service.addReferences(character.id, selected),
          'addFailed',
        );
      },
      title: translate('references.galleryTitle'),
    });
  }, [
    character.id,
    notificationsService,
    openGallery,
    referenceIds,
    run,
    translate,
  ]);

  return { add, isBusy, isFull, move, referenceIds, remove };
}
