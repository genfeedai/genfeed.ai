'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
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
import Card from '@ui/card/Card';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BrandIdentityActions from './BrandIdentityActions';
import BrandIdentityAvatarField from './BrandIdentityAvatarField';
import BrandIdentityVoiceField from './BrandIdentityVoiceField';

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

  const handleSave = useCallback(() => {
    handleSaveIdentity().catch((error) => {
      logger.error('Failed to save brand identity defaults', error);
    });
  }, [handleSaveIdentity]);

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
          <BrandIdentityAvatarField
            avatars={avatars}
            selectedAvatarId={selectedAvatarId}
            selectedAvatar={selectedAvatar}
            isLoadingAvatars={isLoadingAvatars}
            onAvatarChange={setSelectedAvatarId}
          />

          <BrandIdentityVoiceField
            catalogOptions={catalogOptions}
            selectedVoiceId={selectedVoiceId}
            isLoadingCatalog={isLoadingCatalog}
            previewVoice={previewVoice}
            onVoiceChange={setSelectedVoiceId}
          />

          <BrandIdentityActions
            isSavingIdentity={isSavingIdentity}
            isUsingOrgFallback={isUsingOrgFallback}
            currentAvatarSummary={currentAvatarSummary}
            currentVoiceSummary={currentVoiceSummary}
            onSave={handleSave}
            onBrowseAvatars={() => router.push('/library/avatars')}
            onBrowseVoices={() => router.push('/library/voices')}
          />
        </div>
      </div>
    </Card>
  );
}
