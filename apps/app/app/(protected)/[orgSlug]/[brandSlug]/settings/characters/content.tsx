'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  IngredientStatus,
  isPersonaHandle,
  normalizePersonaHandle,
  QualityTier,
} from '@genfeedai/enums';
import type {
  BrandCharacterCandidate,
  BrandCharacterListItem,
  BrandCharacterSheetStep,
  IImage,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { PersonasService } from '@services/content/personas.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createMediaHandler } from '@services/core/socket-manager.service';
import { ImagesService } from '@services/ingredients/images.service';
import Card from '@ui/card/Card';
import { SkeletonList } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { resolvePendingIds } from '@utils/network/generation.util';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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

export default function BrandSettingsCharactersPage(): ReactElement {
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

  if (!brandId) {
    return (
      <Container>
        <Card>
          <p className="text-sm text-muted-foreground">
            {translate('errors.brandUnavailable')}
          </p>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <Card>
          <h1 className="text-lg font-medium">{translate('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate('subtitle')}
          </p>
        </Card>

        <Card>
          <h2 className="text-base font-medium">{translate('list.title')}</h2>
          {isLoading ? (
            <div className="mt-3" data-testid="characters-list-loading">
              <SkeletonList count={3} />
            </div>
          ) : characters.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {translate('empty')}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {characters.map((character) => (
                <li className="flex items-center gap-3" key={character.id}>
                  {character.avatarIngredientId ? (
                    <Image
                      alt={character.label}
                      className="size-10 rounded object-cover"
                      height={40}
                      src={resolveCharacterImageUrl(
                        character.avatarIngredientId,
                      )}
                      width={40}
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {character.label}
                    </p>
                    {character.handle ? (
                      <p className="text-xs text-muted-foreground">
                        @{character.handle}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-medium">{translate('create.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate('create.description')}
          </p>

          {step === 'describe' || step === 'candidate' ? (
            <div className="mt-4 flex flex-col gap-3">
              <Textarea
                aria-label={translate('fields.description')}
                data-testid="character-description"
                isDisabled={isGenerating || step === 'candidate'}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={translate('fields.descriptionPlaceholder')}
                value={description}
              />
              <Checkbox
                isChecked={isNonHumanoid}
                isDisabled={isGenerating || step === 'candidate'}
                label={translate('fields.nonHumanoid')}
                name="character-non-humanoid"
                onCheckedChange={(checked) =>
                  setIsNonHumanoid(checked === true)
                }
              />
              <Input
                aria-label={translate('fields.seed')}
                data-testid="character-seed"
                isDisabled={isGenerating || step === 'candidate'}
                onChange={(event) => setSeed(event.target.value)}
                placeholder={translate('fields.seed')}
                value={seed}
              />
              {step === 'describe' ? (
                <Button
                  data-testid="generate-sheet"
                  isDisabled={isGenerating || description.trim().length === 0}
                  isLoading={isGenerating}
                  label={
                    isGenerating
                      ? translate('actions.generating')
                      : translate('actions.generate')
                  }
                  onClick={() => {
                    void generateSheet();
                  }}
                  size={ButtonSize.DEFAULT}
                  variant={ButtonVariant.DEFAULT}
                />
              ) : null}
            </div>
          ) : null}

          {step === 'candidate' && candidate ? (
            <div className="mt-4 flex flex-col gap-3">
              <Image
                alt={translate('candidate.alt')}
                className="w-full rounded object-cover"
                data-testid="candidate-image"
                height={512}
                src={candidate.url}
                width={512}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  data-testid="regenerate-sheet"
                  isDisabled={isGenerating}
                  isLoading={isGenerating}
                  label={translate('actions.regenerate')}
                  onClick={() => {
                    void generateSheet();
                  }}
                  variant={ButtonVariant.SECONDARY}
                />
                <Button
                  data-testid="discard-sheet"
                  isDisabled={isGenerating}
                  label={translate('actions.discard')}
                  onClick={discardCandidate}
                  variant={ButtonVariant.GHOST}
                />
                <Button
                  data-testid="approve-sheet"
                  isDisabled={isGenerating}
                  label={translate('actions.approve')}
                  onClick={approveCandidate}
                  variant={ButtonVariant.DEFAULT}
                />
              </div>
            </div>
          ) : null}

          {step === 'approve' && candidate ? (
            <div className="mt-4 flex flex-col gap-3">
              <Image
                alt={translate('candidate.alt')}
                className="w-full rounded object-cover"
                height={512}
                src={candidate.url}
                width={512}
              />
              <Input
                aria-label={translate('fields.name')}
                data-testid="character-name"
                onChange={(event) => setLabel(event.target.value)}
                placeholder={translate('fields.namePlaceholder')}
                value={label}
              />
              <Input
                aria-label={translate('fields.handle')}
                data-testid="character-handle"
                onChange={(event) => setHandle(event.target.value)}
                placeholder={translate('fields.handlePlaceholder')}
                value={handle}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  data-testid="discard-sheet"
                  isDisabled={isCreating}
                  label={translate('actions.discard')}
                  onClick={discardCandidate}
                  variant={ButtonVariant.GHOST}
                />
                <Button
                  data-testid="create-character"
                  isDisabled={isCreating}
                  isLoading={isCreating}
                  label={
                    isCreating
                      ? translate('actions.creating')
                      : translate('actions.approve')
                  }
                  onClick={() => {
                    void createCharacter();
                  }}
                  variant={ButtonVariant.DEFAULT}
                />
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </Container>
  );
}
