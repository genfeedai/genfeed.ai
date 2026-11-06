import type { PersonaAvailabilityMode } from '@genfeedai/contracts';
import type {
  BrandCharacterListItem,
  CharacterGrantItem,
  GrantableOrganization,
} from '@genfeedai/contracts/interfaces';
import { CHARACTERS_CHANGED_EVENT } from '@genfeedai/helpers/content/character-mention.util';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { PersonasService } from '@services/content/personas.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CharacterGrantsState } from '@/props/characters/characters-page.props';

const EMPTY_GRANTS: CharacterGrantItem[] = [];
const EMPTY_ORGANIZATIONS: GrantableOrganization[] = [];
const GRANTABLE_ORGANIZATIONS_QUERY_KEY = ['grantable-organizations'] as const;

function characterGrantsQueryKey(characterId: string | null) {
  return ['character-grants', characterId] as const;
}

function createPersonasService(token: string): PersonasService {
  return PersonasService.getInstance(token);
}

/**
 * Grants of one character to other organizations the member administers
 * (#6037). Loaded only for a character this organization owns.
 *
 * Both reads are cached per viewer (and the grants per character), so
 * reopening the availability dialog paints them at once and refreshes them in
 * the background. A grant or revoke re-reads both.
 */
export function useCharacterGrants(
  character: BrandCharacterListItem | null,
): CharacterGrantsState {
  const translate = useTranslations('common.settings.characters.grants');
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const queryClient = useQueryClient();
  const getPersonasService = useAuthedService(createPersonasService);
  const [isWorking, setIsWorking] = useState(false);
  const characterId = character && !character.isGranted ? character.id : null;

  const grantsQuery = useAuthedQuery<PersonasService, CharacterGrantItem[]>({
    enabled: Boolean(characterId),
    queryFn: (service) => {
      if (!characterId) {
        throw new Error('character_grants_character_required');
      }
      return service.listGrants(characterId);
    },
    queryKey: characterGrantsQueryKey(characterId),
    service: createPersonasService,
  });
  const organizationsQuery = useAuthedQuery<
    PersonasService,
    GrantableOrganization[]
  >({
    enabled: Boolean(characterId),
    queryFn: (service) => service.listGrantableOrganizations(),
    queryKey: GRANTABLE_ORGANIZATIONS_QUERY_KEY,
    service: createPersonasService,
  });

  const loadError = grantsQuery.error ?? organizationsQuery.error;
  useEffect(() => {
    if (loadError) {
      logger.error('Failed to load character grants', loadError);
    }
  }, [loadError]);

  const run = useCallback(
    async (work: () => Promise<void>, successKey: string, errorKey: string) => {
      setIsWorking(true);
      try {
        await work();
        window.dispatchEvent(new Event(CHARACTERS_CHANGED_EVENT));
        notificationsService.success(translate(successKey));
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: characterGrantsQueryKey(characterId),
          }),
          queryClient.invalidateQueries({
            queryKey: GRANTABLE_ORGANIZATIONS_QUERY_KEY,
          }),
        ]);
      } catch (error: unknown) {
        logger.error('Failed to change character grant', error);
        notificationsService.error(translate(errorKey));
      } finally {
        setIsWorking(false);
      }
    },
    [characterId, notificationsService, queryClient, translate],
  );

  const grant = useCallback(
    async (input: {
      brandIds: string[];
      mode: PersonaAvailabilityMode;
      recipientOrganizationId: string;
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

  return {
    grant,
    grants: (characterId ? grantsQuery.data : undefined) ?? EMPTY_GRANTS,
    isLoading: grantsQuery.isLoading || organizationsQuery.isLoading,
    isWorking,
    organizations:
      (characterId ? organizationsQuery.data : undefined) ??
      EMPTY_ORGANIZATIONS,
    revoke,
  };
}
