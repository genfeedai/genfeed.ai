import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  IngredientStatus,
  isPersonaHandle,
  MemberRole,
  normalizePersonaHandle,
  PageScope,
  PersonaAvailabilityMode,
  QualityTier,
} from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  BrandCharacterCandidate,
  BrandCharacterListItem,
  BrandCharacterSheetStep,
  CharacterReferenceItem,
  IImage,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import { CHARACTERS_CHANGED_EVENT } from '@genfeedai/helpers/content/character-mention.util';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { PersonasService } from '@services/content/personas.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createMediaHandler } from '@services/core/socket-manager.service';
import { ImagesService } from '@services/ingredients/images.service';
import { useQueryClient } from '@tanstack/react-query';
import { resolvePendingIds } from '@utils/network/generation.util';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUserRole } from '@/hooks/auth/use-user-role/use-user-role';
import type {
  CharacterAvailabilityDraft,
  CharactersPageState,
} from '@/props/characters/characters-page.props';

function resolveCharacterImageUrl(id: string): string {
  return `${EnvironmentService.ingredientsEndpoint}/images/${id}`;
}

const EMPTY_CHARACTERS: BrandCharacterListItem[] = [];
/** The Library characters table; the chat picker caches `brand-characters`. */
const CHARACTERS_QUERY_KEY = 'library-characters';

function createPersonasService(token: string): PersonasService {
  return PersonasService.getInstance(token);
}

const OWNING_BRAND_ONLY: CharacterAvailabilityDraft = {
  brandIds: [],
  mode: PersonaAvailabilityMode.OWNING_BRAND,
};

function parseOptionalSeed(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function useCharactersPage(
  scope: PageScope.BRAND | PageScope.ORGANIZATION = PageScope.BRAND,
): CharactersPageState {
  const isOrganizationScope = scope === PageScope.ORGANIZATION;
  const translate = useTranslations('common.settings.characters');
  const { brandId, brands, organizationId } = useBrand();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const role = useUserRole();
  const canManageSharing =
    role === MemberRole.OWNER || role === MemberRole.ADMIN;
  const brandOptions = useMemo(
    () => brands.map((brand) => ({ id: brand.id, label: brand.label })),
    [brands],
  );
  const { subscribe } = useSocketManager();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getPersonasService = useAuthedService(createPersonasService);
  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [isNonHumanoid, setIsNonHumanoid] = useState(false);
  const [seed, setSeed] = useState('');
  const [step, setStep] = useState<BrandCharacterSheetStep>('describe');
  const [candidate, setCandidate] = useState<BrandCharacterCandidate | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [handle, setHandle] = useState('');
  const [availability, setAvailability] =
    useState<CharacterAvailabilityDraft>(OWNING_BRAND_ONLY);
  const [availabilityCharacter, setAvailabilityCharacter] =
    useState<BrandCharacterListItem | null>(null);
  const [availabilityDraft, setAvailabilityDraft] =
    useState<CharacterAvailabilityDraft>(OWNING_BRAND_ONLY);
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [isMovingOwnership, setIsMovingOwnership] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const cleanupSocket = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  useEffect(() => {
    return () => cleanupSocket();
  }, [cleanupSocket]);

  // One brand's characters (or every brand's, on the organization page), cached per viewer, brand and page: coming back
  // paints the last page at once and refreshes it in the background, and a
  // new page keeps the current rows on screen while it loads.
  const charactersScopeKey = [
    CHARACTERS_QUERY_KEY,
    organizationId || null,
    isOrganizationScope ? 'organization' : brandId || null,
  ];
  const charactersQuery = useAuthedQuery<
    PersonasService,
    IPaginatedResponse<BrandCharacterListItem>
  >({
    enabled: isOrganizationScope ? Boolean(organizationId) : Boolean(brandId),
    keepPreviousDataWithin: charactersScopeKey,
    queryFn: async (service, signal) => {
      try {
        return await service.listCharactersPage(
          {
            ...(isOrganizationScope ? { allBrands: true } : {}),
            limit: ITEMS_PER_PAGE,
            page: currentPage,
          },
          signal,
        );
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load brand characters', error);
        }
        throw error;
      }
    },
    queryKey: [...charactersScopeKey, { page: currentPage }],
    service: createPersonasService,
  });
  const charactersPage = charactersQuery.data;
  const characters = charactersPage?.items ?? EMPTY_CHARACTERS;
  const isLoading =
    Boolean(isOrganizationScope ? organizationId : brandId) &&
    charactersQuery.isPending;
  const charactersLoadError = charactersQuery.error;
  const hasCharactersPage = charactersPage !== undefined;

  // A failed first read says so; a failed background refresh keeps the list.
  useEffect(() => {
    if (charactersLoadError && !hasCharactersPage) {
      notificationsService.error(translate('errors.loadFailed'));
    }
  }, [charactersLoadError, hasCharactersPage, notificationsService, translate]);

  // A save can change any brand's list (sharing, ownership moves), so every
  // cached characters page re-reads; the visible one before this resolves.
  const refreshCharacters = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [CHARACTERS_QUERY_KEY] }),
    [queryClient],
  );

  const waitForCandidate = useCallback(
    (pendingId: string) => {
      cleanupSocket();
      const topic = `/images/${pendingId}`;
      const handler = createMediaHandler(
        async (result) => {
          const resolvedId =
            typeof result === 'string'
              ? result
              : typeof result === 'object' &&
                  result &&
                  'id' in result &&
                  typeof result.id === 'string'
                ? result.id
                : pendingId;
          setCandidate({
            id: resolvedId,
            url: resolveCharacterImageUrl(resolvedId),
          });
          setStep('candidate');
          setIsGenerating(false);
          cleanupSocket();
        },
        (errorMessage: string) => {
          setIsGenerating(false);
          notificationsService.error(
            errorMessage || translate('errors.generateFailed'),
          );
          cleanupSocket();
        },
      );
      unsubscribeRef.current = subscribe(topic, handler);
    },
    [cleanupSocket, notificationsService, subscribe, translate],
  );

  const generateSheet = useCallback(async () => {
    const trimmed = description.trim();
    if (!brandId || !trimmed || isGenerating) {
      return;
    }

    setIsGenerating(true);
    cleanupSocket();

    try {
      const [personasService, imagesService] = await Promise.all([
        getPersonasService(),
        getImagesService(),
      ]);
      const composed = await personasService.composeSheetPrompt({
        description: trimmed,
        isNonHumanoid,
      });
      const created = await imagesService.post({
        autoSelectModel: true,
        brand: brandId,
        brandingMode: 'off',
        height: 1024,
        isBrandingEnabled: false,
        outputs: 1,
        quality: QualityTier.BASIC,
        seed: parseOptionalSeed(seed),
        text: composed.prompt,
        width: 1024,
      } as unknown as Partial<IImage>);
      const pendingId = resolvePendingIds(created)[0];
      if (!pendingId) {
        throw new Error('Missing generated sheet id');
      }

      const status =
        created && typeof created === 'object' && 'status' in created
          ? String((created as { status?: string }).status)
          : '';
      const immediateUrl =
        created && typeof created === 'object'
          ? ((created as { url?: string; ingredientUrl?: string }).url ??
            (created as { ingredientUrl?: string }).ingredientUrl)
          : undefined;

      if (immediateUrl && status === IngredientStatus.GENERATED) {
        setCandidate({ id: pendingId, url: immediateUrl });
        setStep('candidate');
        setIsGenerating(false);
        return;
      }

      waitForCandidate(pendingId);
    } catch (error: unknown) {
      logger.error('Failed to generate character sheet', error);
      setIsGenerating(false);
      notificationsService.error(translate('errors.generateFailed'));
    }
  }, [
    brandId,
    cleanupSocket,
    description,
    getImagesService,
    getPersonasService,
    isGenerating,
    isNonHumanoid,
    notificationsService,
    seed,
    translate,
    waitForCandidate,
  ]);

  const discardCandidate = useCallback(() => {
    cleanupSocket();
    setCandidate(null);
    setStep('describe');
    setLabel('');
    setHandle('');
    setAvailability(OWNING_BRAND_ONLY);
    setIsGenerating(false);
  }, [cleanupSocket]);

  const approveCandidate = useCallback(() => {
    if (!candidate) {
      return;
    }
    setStep('approve');
  }, [candidate]);

  const createCharacter = useCallback(async () => {
    if (!candidate || isCreating) {
      return;
    }
    const nextLabel = label.trim();
    const nextHandle = normalizePersonaHandle(handle);
    if (!nextLabel || !nextHandle) {
      notificationsService.error(translate('errors.missingName'));
      return;
    }
    if (!isPersonaHandle(nextHandle)) {
      notificationsService.error(translate('errors.invalidHandle'));
      return;
    }

    setIsCreating(true);
    try {
      const service = await getPersonasService();
      await service.createFromSheet({
        assetId: candidate.id,
        ...(canManageSharing &&
        availability.mode !== PersonaAvailabilityMode.OWNING_BRAND
          ? {
              availability: {
                brandIds: availability.brandIds,
                mode: availability.mode,
              },
            }
          : {}),
        handle: nextHandle,
        label: nextLabel,
      });
      window.dispatchEvent(new Event(CHARACTERS_CHANGED_EVENT));
      notificationsService.success(translate('success'));
      discardCandidate();
      setDescription('');
      setIsNonHumanoid(false);
      setSeed('');
      setIsCreateDialogOpen(false);
      await refreshCharacters();
    } catch (error: unknown) {
      logger.error('Failed to create character from sheet', error);
      notificationsService.error(translate('errors.approveFailed'));
    } finally {
      setIsCreating(false);
    }
  }, [
    availability,
    candidate,
    canManageSharing,
    discardCandidate,
    getPersonasService,
    handle,
    isCreating,
    label,
    notificationsService,
    refreshCharacters,
    translate,
  ]);

  const openAvailability = useCallback((character: BrandCharacterListItem) => {
    setAvailabilityCharacter(character);
    setAvailabilityDraft({
      brandIds: character.availableBrandIds ?? [],
      mode: character.availabilityMode ?? PersonaAvailabilityMode.OWNING_BRAND,
    });
  }, []);

  const closeAvailability = useCallback(() => {
    setAvailabilityCharacter(null);
  }, []);

  const saveAvailability = useCallback(async () => {
    if (!availabilityCharacter || isSavingAvailability) {
      return;
    }
    setIsSavingAvailability(true);
    try {
      const service = await getPersonasService();
      await service.updateAvailability(availabilityCharacter.id, {
        brandIds: availabilityDraft.brandIds,
        mode: availabilityDraft.mode,
      });
      window.dispatchEvent(new Event(CHARACTERS_CHANGED_EVENT));
      notificationsService.success(translate('availability.success'));
      setAvailabilityCharacter(null);
      await refreshCharacters();
    } catch (error: unknown) {
      logger.error('Failed to update character availability', error);
      notificationsService.error(translate('availability.error'));
    } finally {
      setIsSavingAvailability(false);
    }
  }, [
    availabilityCharacter,
    availabilityDraft,
    getPersonasService,
    isSavingAvailability,
    notificationsService,
    refreshCharacters,
    translate,
  ]);

  const moveOwnership = useCallback(
    async (targetBrandId: string) => {
      if (!availabilityCharacter || isMovingOwnership) {
        return;
      }
      setIsMovingOwnership(true);
      try {
        const service = await getPersonasService();
        await service.moveOwnership(availabilityCharacter.id, targetBrandId);
        window.dispatchEvent(new Event(CHARACTERS_CHANGED_EVENT));
        notificationsService.success(translate('ownership.success'));
        setAvailabilityCharacter(null);
        await refreshCharacters();
      } catch (error: unknown) {
        logger.error('Failed to move character ownership', error);
        notificationsService.error(translate('ownership.error'));
      } finally {
        setIsMovingOwnership(false);
      }
    },
    [
      availabilityCharacter,
      getPersonasService,
      isMovingOwnership,
      notificationsService,
      refreshCharacters,
      translate,
    ],
  );

  const applyReferences = useCallback(
    (characterId: string, references: CharacterReferenceItem[]) => {
      const referenceIngredientIds = [...references]
        .sort((first, second) => first.position - second.position)
        .map((reference) => reference.ingredientId);
      queryClient.setQueriesData<IPaginatedResponse<BrandCharacterListItem>>(
        { queryKey: [CHARACTERS_QUERY_KEY] },
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((character) =>
                  character.id === characterId
                    ? {
                        ...character,
                        avatarIngredientId: referenceIngredientIds[0] ?? null,
                        referenceIngredientIds,
                      }
                    : character,
                ),
              }
            : current,
      );
      window.dispatchEvent(new Event(CHARACTERS_CHANGED_EVENT));
    },
    [queryClient],
  );

  const openCreateDialog = useCallback(() => {
    setIsCreateDialogOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback(
    (isOpen: boolean) => {
      setIsCreateDialogOpen(isOpen);
      if (!isOpen) {
        discardCandidate();
        setDescription('');
        setIsNonHumanoid(false);
        setSeed('');
      }
    },
    [discardCandidate],
  );

  return {
    approve: {
      availability,
      handle,
      label,
      setAvailability,
      setHandle,
      setLabel,
    },
    applyReferences,
    approveCandidate,
    availabilityControls: {
      character: availabilityCharacter,
      close: closeAvailability,
      draft: availabilityDraft,
      isMoving: isMovingOwnership,
      isSaving: isSavingAvailability,
      moveOwnership,
      open: openAvailability,
      save: saveAvailability,
      setDraft: setAvailabilityDraft,
    },
    brandId,
    brands: brandOptions,
    candidate,
    canManageSharing,
    characters,
    pageTotals: charactersPage
      ? {
          totalDocs: charactersPage.total,
          totalPages: charactersPage.totalPages,
        }
      : EMPTY_PAGE_TOTALS,
    create: {
      description,
      isNonHumanoid,
      seed,
      setDescription,
      setIsNonHumanoid,
      setSeed,
    },
    createCharacter,
    discardCandidate,
    generateSheet,
    isCreateDialogOpen,
    isCreating,
    isGenerating,
    isLoading,
    openCreateDialog,
    setIsCreateDialogOpen: handleDialogOpenChange,
    step,
  };
}
