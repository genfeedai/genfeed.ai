import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  IngredientStatus,
  isPersonaHandle,
  normalizePersonaHandle,
  QualityTier,
} from '@genfeedai/contracts';
import type {
  BrandCharacterCandidate,
  BrandCharacterListItem,
  BrandCharacterSheetStep,
  IImage,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import type { CharactersPageState } from '@props/characters/characters-page.props';
import { PersonasService } from '@services/content/personas.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createMediaHandler } from '@services/core/socket-manager.service';
import { ImagesService } from '@services/ingredients/images.service';
import { resolvePendingIds } from '@utils/network/generation.util';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function resolveCharacterImageUrl(id: string): string {
  return `${EnvironmentService.ingredientsEndpoint}/images/${id}`;
}

function parseOptionalSeed(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function useCharactersPage(): CharactersPageState {
  const translate = useTranslations('common.settings.characters');
  const { brandId } = useBrand();
  const { subscribe } = useSocketManager();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getPersonasService = useAuthedService((token: string) =>
    PersonasService.getInstance(token),
  );
  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const [characters, setCharacters] = useState<BrandCharacterListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const cleanupSocket = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  useEffect(() => {
    return () => cleanupSocket();
  }, [cleanupSocket]);

  const refreshCharacters = useCallback(
    async (signal: AbortSignal) => {
      if (!brandId) {
        return;
      }
      const service = await getPersonasService();
      const rows = await service.listCharacters();
      if (!signal.aborted) {
        setCharacters(rows);
      }
    },
    [brandId, getPersonasService],
  );

  useEffect(() => {
    if (!brandId) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    refreshCharacters(controller.signal)
      .catch((error: unknown) => {
        logger.error('Failed to load brand characters', error);
        if (!controller.signal.aborted) {
          notificationsService.error(translate('errors.loadFailed'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [brandId, notificationsService, refreshCharacters, translate]);

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
      const personasService = await getPersonasService();
      const imagesService = await getImagesService();
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
        handle: nextHandle,
        label: nextLabel,
      });
      notificationsService.success(translate('success'));
      discardCandidate();
      setDescription('');
      setIsNonHumanoid(false);
      setSeed('');
      setIsCreateDialogOpen(false);
      await refreshCharacters(new AbortController().signal);
    } catch (error: unknown) {
      logger.error('Failed to create character from sheet', error);
      notificationsService.error(translate('errors.approveFailed'));
    } finally {
      setIsCreating(false);
    }
  }, [
    candidate,
    discardCandidate,
    getPersonasService,
    handle,
    isCreating,
    label,
    notificationsService,
    refreshCharacters,
    translate,
  ]);

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
    approve: { handle, label, setHandle, setLabel },
    approveCandidate,
    candidate,
    characters,
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
