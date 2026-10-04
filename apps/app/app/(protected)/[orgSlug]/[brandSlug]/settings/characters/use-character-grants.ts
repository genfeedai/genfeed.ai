import type {
  BrandCharacterListItem,
  CharacterGrantItem,
  GrantableOrganization,
} from '@genfeedai/contracts/interfaces';
import { CHARACTERS_CHANGED_EVENT } from '@genfeedai/helpers/content/character-mention.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { CharacterGrantsState } from '@props/characters/characters-page.props';
import { PersonasService } from '@services/content/personas.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Grants of one character to other organizations the member administers
 * (#6037). Loaded only for a character this organization owns.
 */
export function useCharacterGrants(
  character: BrandCharacterListItem | null,
): CharacterGrantsState {
  const translate = useTranslations('common.settings.characters.grants');
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getPersonasService = useAuthedService((token: string) =>
    PersonasService.getInstance(token),
  );
  const [grants, setGrants] = useState<CharacterGrantItem[]>([]);
  const [organizations, setOrganizations] = useState<GrantableOrganization[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const characterId = character && !character.isGranted ? character.id : null;

  const reload = useCallback(
    async (signal: AbortSignal) => {
      if (!characterId) {
        return;
      }
      const service = await getPersonasService();
      const [nextGrants, nextOrganizations] = await Promise.all([
        service.listGrants(characterId),
        service.listGrantableOrganizations(),
      ]);
      if (!signal.aborted) {
        setGrants(nextGrants);
        setOrganizations(nextOrganizations);
      }
    },
    [characterId, getPersonasService],
  );

  useEffect(() => {
    setGrants([]);
    setOrganizations([]);
    if (!characterId) {
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    reload(controller.signal)
      .catch((error: unknown) => {
        logger.error('Failed to load character grants', error);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => controller.abort();
  }, [characterId, reload]);

  const run = useCallback(
    async (work: () => Promise<void>, successKey: string, errorKey: string) => {
      setIsWorking(true);
      try {
        await work();
        window.dispatchEvent(new Event(CHARACTERS_CHANGED_EVENT));
        notificationsService.success(translate(successKey));
        await reload(new AbortController().signal);
      } catch (error: unknown) {
        logger.error('Failed to change character grant', error);
        notificationsService.error(translate(errorKey));
      } finally {
        setIsWorking(false);
      }
    },
    [notificationsService, reload, translate],
  );

  const grant = useCallback(
    async (input: {
      brandIds: string[];
      mode: PersonaAvailabilityMode;
      organizationId: string;
    }) => {
      if (!characterId) {
        return;
      }
      await run(
        async () => {
          const service = await getPersonasService();
          await service.grantToOrganization(characterId, input);
        },
        'success',
        'error',
      );
    },
    [characterId, getPersonasService, run],
  );

  const revoke = useCallback(
    async (grantId: string) => {
      if (!characterId) {
        return;
      }
      await run(
        async () => {
          const service = await getPersonasService();
          await service.revokeGrant(characterId, grantId);
        },
        'revoked',
        'revokeError',
      );
    },
    [characterId, getPersonasService, run],
  );

  return { grant, grants, isLoading, isWorking, organizations, revoke };
}
