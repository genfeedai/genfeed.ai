'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import {
  buildDefaultVoiceRefFromVoice,
  type DefaultVoiceRef,
  matchesDefaultVoice,
} from '@helpers/voice/default-voice-ref.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAvatarImages } from '@hooks/data/ingredients/use-avatar-images/use-avatar-images';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import type { Voice } from '@models/ingredients/voice.model';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import type { BrandDetailIdentityCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import SelectedAvatarPreview from '@ui/display/selected-avatar-preview/SelectedAvatarPreview';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

function getVoiceName(voice: Voice): string {
  return voice.metadataLabel || voice.externalVoiceId || voice.id;
}

export default function BrandDetailIdentityCard({
  brand,
  brandId,
  onRefreshBrand,
}: BrandDetailIdentityCardProps) {
  const router = useRouter();
  const notifications = NotificationsService.getInstance();
  const { organizationId, refreshBrands } = useBrand();
  const { settings: orgSettings } = useOrganization();
  const { avatars, isLoading: isLoadingAvatars } =
    useAvatarImages(organizationId);
  const { isLoading: isLoadingCatalog, voices: catalog } = useVoiceCatalog({
    isActive: true,
    pagination: false,
  });

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const brandDefaultVoiceRef = brand.agentConfig?.defaultVoiceRef as
    | DefaultVoiceRef
    | null
    | undefined;

  const orgDefaultVoiceRef = orgSettings?.defaultVoiceRef as
    | DefaultVoiceRef
    | null
    | undefined;

  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState('');
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);

  useEffect(() => {
    setSelectedAvatarId(brand.agentConfig?.defaultAvatarIngredientId ?? '');
  }, [brand.agentConfig?.defaultAvatarIngredientId]);

  useEffect(() => {
    const selectedVoice =
      catalog.find((voice) =>
        matchesDefaultVoice(
          {
            defaultVoiceId: brand.agentConfig?.defaultVoiceId,
            defaultVoiceRef: brandDefaultVoiceRef,
          },
          voice,
        ),
      ) ?? null;

    setSelectedVoiceId(
      selectedVoice?.id ?? brand.agentConfig?.defaultVoiceId ?? '',
    );
  }, [brand.agentConfig?.defaultVoiceId, brandDefaultVoiceRef, catalog]);

  const catalogOptions = useMemo(
    () =>
      catalog.map((voice) => ({
        label: `${getVoiceName(voice)} (${voice.provider})`,
        value: voice.id,
      })),
    [catalog],
  );

  const selectedVoice = useMemo(
    () => catalog.find((voice) => voice.id === selectedVoiceId) ?? null,
    [catalog, selectedVoiceId],
  );

  const fallbackVoice = useMemo(() => {
    if (
      selectedVoiceId ||
      (!orgSettings?.defaultVoiceId && !orgSettings?.defaultVoiceRef)
    ) {
      return null;
    }

    return (
      catalog.find((voice) =>
        matchesDefaultVoice(
          {
            defaultVoiceId: orgSettings?.defaultVoiceId,
            defaultVoiceRef: orgDefaultVoiceRef,
          },
          voice,
        ),
      ) ?? null
    );
  }, [
    catalog,
    orgDefaultVoiceRef,
    orgSettings?.defaultVoiceId,
    orgSettings?.defaultVoiceRef,
    selectedVoiceId,
  ]);

  const previewVoice = selectedVoice ?? fallbackVoice;

  const currentVoiceSummary = useMemo(() => {
    if (brand.agentConfig?.defaultVoiceId || brandDefaultVoiceRef) {
      const selectedVoice = catalog.find((voice) =>
        matchesDefaultVoice(
          {
            defaultVoiceId: brand.agentConfig?.defaultVoiceId,
            defaultVoiceRef: brandDefaultVoiceRef,
          },
          voice,
        ),
      );
      return selectedVoice
        ? `${getVoiceName(selectedVoice)} (${selectedVoice.provider})`
        : 'Saved voice default';
    }

    if (orgSettings?.defaultVoiceId || orgSettings?.defaultVoiceRef) {
      const selectedVoice = catalog.find((voice) =>
        matchesDefaultVoice(
          {
            defaultVoiceId: orgSettings?.defaultVoiceId,
            defaultVoiceRef: orgDefaultVoiceRef,
          },
          voice,
        ),
      );
      return selectedVoice
        ? `${getVoiceName(selectedVoice)} (${selectedVoice.provider})`
        : 'Organization voice default';
    }

    return 'No brand-specific default voice';
  }, [
    brand.agentConfig?.defaultVoiceId,
    brandDefaultVoiceRef,
    catalog,
    orgSettings?.defaultVoiceId,
    orgDefaultVoiceRef,
    orgSettings?.defaultVoiceRef,
  ]);

  const selectedAvatar = useMemo(
    () => avatars.find((avatar) => avatar.id === selectedAvatarId) ?? null,
    [avatars, selectedAvatarId],
  );

  const currentAvatarSummary = useMemo(() => {
    const currentAvatar =
      avatars.find(
        (avatar) =>
          avatar.id ===
          (brand.agentConfig?.defaultAvatarIngredientId ??
            orgSettings?.defaultAvatarIngredientId),
      ) ?? null;

    if (!currentAvatar) {
      return brand.agentConfig?.defaultAvatarIngredientId ||
        orgSettings?.defaultAvatarIngredientId
        ? 'Saved avatar default'
        : 'No brand-specific default avatar';
    }

    return getIngredientDisplayLabel(currentAvatar);
  }, [
    avatars,
    brand.agentConfig?.defaultAvatarIngredientId,
    orgSettings?.defaultAvatarIngredientId,
  ]);

  const isUsingOrgFallback = useMemo(
    () =>
      !brand.agentConfig?.defaultVoiceId &&
      !brand.agentConfig?.defaultAvatarIngredientId &&
      Boolean(
        orgSettings?.defaultVoiceId || orgSettings?.defaultAvatarIngredientId,
      ),
    [
      brand.agentConfig?.defaultAvatarIngredientId,
      brand.agentConfig?.defaultVoiceId,
      orgSettings?.defaultAvatarIngredientId,
      orgSettings?.defaultVoiceId,
    ],
  );

  const handleSaveIdentity = useCallback(async () => {
    setIsSavingIdentity(true);

    try {
      const selectedVoice =
        selectedVoiceId.length > 0
          ? (catalog.find((voice) => voice.id === selectedVoiceId) ?? null)
          : null;

      const service = await getBrandsService();
      await service.updateAgentConfig(brandId, {
        defaultAvatarIngredientId: selectedAvatarId || null,
        defaultVoiceId: selectedVoice?.id ?? null,
        defaultVoiceRef: buildDefaultVoiceRefFromVoice(selectedVoice),
      });
      await refreshBrands();
      await onRefreshBrand();
      notifications.success('Brand identity defaults saved');
    } catch (error) {
      logger.error('Failed to save brand identity defaults', error);
      notifications.error('Failed to save brand identity defaults');
    } finally {
      setIsSavingIdentity(false);
    }
  }, [
    brandId,
    catalog,
    getBrandsService,
    notifications,
    onRefreshBrand,
    refreshBrands,
    selectedAvatarId,
    selectedVoiceId,
  ]);

  return (
    <Card className="p-6" data-testid="brand-identity-card">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Brand Identity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set brand-specific avatar and voice defaults. If left blank,
            organization defaults are used automatically.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="brand-default-avatar"
              className="mb-1 block text-sm font-medium"
            >
              Default Avatar
            </label>
            <Select
              disabled={isLoadingAvatars}
              onValueChange={(value) =>
                setSelectedAvatarId(value === 'none' ? '' : value)
              }
              value={selectedAvatarId || 'none'}
            >
              <SelectTrigger
                id="brand-default-avatar"
                className="w-full"
                data-testid="brand-default-avatar-trigger"
              >
                <SelectValue
                  placeholder={
                    isLoadingAvatars
                      ? 'Loading avatars...'
                      : 'Select a saved avatar for this brand'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Use organization fallback</SelectItem>
                {avatars.map((avatar) => (
                  <SelectItem key={avatar.id} value={avatar.id}>
                    {getIngredientDisplayLabel(avatar)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAvatar ? (
              <SelectedAvatarPreview
                description="Leave empty to inherit the organization avatar."
                imageAlt={
                  getIngredientDisplayLabel(selectedAvatar) || 'Selected avatar'
                }
                imageUrl={
                  selectedAvatar.ingredientUrl || '/placeholders/portrait.jpg'
                }
                title={
                  getIngredientDisplayLabel(selectedAvatar) || 'Selected avatar'
                }
                wrapperClassName="mt-3"
              />
            ) : null}
          </div>

          <div>
            <label
              htmlFor="brand-default-voice-ref"
              className="mb-1 block text-sm font-medium"
            >
              Default Voice
            </label>
            <Select
              disabled={isLoadingCatalog}
              onValueChange={(value) =>
                setSelectedVoiceId(value === 'none' ? '' : value)
              }
              value={selectedVoiceId || 'none'}
            >
              <SelectTrigger
                id="brand-default-voice-ref"
                className="w-full"
                data-testid="brand-default-voice-trigger"
              >
                <SelectValue
                  placeholder={
                    isLoadingCatalog
                      ? 'Loading voices...'
                      : 'Select a saved voice for this brand'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Use organization fallback</SelectItem>
                {catalogOptions.map((voice) => (
                  <SelectItem key={voice.value} value={voice.value}>
                    {voice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {previewVoice ? (
              <div
                className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3"
                data-testid="brand-default-voice-preview"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {selectedVoiceId
                        ? 'Selected voice preview'
                        : 'Organization fallback preview'}
                    </p>
                    <p
                      className="text-xs text-muted-foreground"
                      data-testid="brand-default-voice-preview-label"
                    >
                      {`${getVoiceName(previewVoice)} (${previewVoice.provider ?? 'unknown'})`}
                    </p>
                  </div>
                  <AudioPreviewPlayer
                    audioUrl={previewVoice.sampleAudioUrl ?? null}
                    label={getVoiceName(previewVoice)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {isUsingOrgFallback ? (
            <p className="text-xs text-muted-foreground">
              This brand is currently using organization identity defaults.
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Current avatar: {currentAvatarSummary}. Current voice:{' '}
            {currentVoiceSummary}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-testid="save-brand-identity"
              onClick={() => {
                handleSaveIdentity().catch((error) => {
                  logger.error('Failed to save brand identity defaults', error);
                });
              }}
              isDisabled={isSavingIdentity}
              withWrapper={false}
            >
              {isSavingIdentity ? 'Saving...' : 'Save Brand Identity'}
            </Button>
            <Button
              data-testid="brand-browse-avatar-library"
              onClick={() => router.push('/library/avatars')}
              type="button"
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              Browse Avatar Library
            </Button>
            <Button
              onClick={() => router.push('/library/voices')}
              type="button"
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              Browse Voice Library
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
