'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationSlug } from '@contexts/user/brand-context/brand-context.helpers';
import { VoiceProvider } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import {
  buildDefaultVoiceRefFromVoice,
  type DefaultVoiceRef,
  matchesDefaultVoice,
} from '@helpers/voice/default-voice-ref.helper';
import {
  heyGenAvatarValue,
  heyGenDefaultVoice,
  heyGenVoiceValue,
} from '@helpers/voice/heygen-identity.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAvatarImages } from '@hooks/data/ingredients/use-avatar-images/use-avatar-images';
import { useHeyGenCatalog } from '@hooks/data/integrations/use-heygen-catalog';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Voice } from '@models/ingredients/voice.model';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import type { BrandDetailIdentityCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('pages.identityDefaults');
  const router = useRouter();
  const { orgSlug, orgHref } = useOrgUrl();
  const ownerOrgSlug = getBrandOrganizationSlug(brand) || orgSlug;
  const libraryHref = (path: string) =>
    brand.slug
      ? createBrandAppRoute(ownerOrgSlug, brand.slug, path)
      : orgHref(path);
  const notifications = NotificationsService.getInstance();
  const { organizationId, refreshBrands } = useBrand();
  const { settings: orgSettings } = useOrganization();
  const { avatars, isLoading: isLoadingAvatars } =
    useAvatarImages(organizationId);
  const { isLoading: isLoadingCatalog, voices: catalog } = useVoiceCatalog({
    isActive: true,
  });

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const heygen = useHeyGenCatalog();
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
    setSelectedAvatarId(
      brand.agentConfig?.defaultAvatarRef
        ? heyGenAvatarValue(brand.agentConfig.defaultAvatarRef)
        : (brand.agentConfig?.defaultAvatarIngredientId ?? ''),
    );
  }, [
    brand.agentConfig?.defaultAvatarIngredientId,
    brand.agentConfig?.defaultAvatarRef,
  ]);

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
      brandDefaultVoiceRef?.provider === VoiceProvider.HEYGEN &&
        brandDefaultVoiceRef.externalVoiceId &&
        brandDefaultVoiceRef.ownership
        ? heyGenVoiceValue({
            ownership: brandDefaultVoiceRef.ownership,
            voiceId: brandDefaultVoiceRef.externalVoiceId,
          })
        : (selectedVoice?.id ?? brand.agentConfig?.defaultVoiceId ?? ''),
    );
  }, [brand.agentConfig?.defaultVoiceId, brandDefaultVoiceRef, catalog]);

  const catalogOptions = useMemo(
    () => [
      ...catalog.map((voice) => ({
        label: `${getVoiceName(voice)} (${voice.provider})`,
        value: voice.id,
      })),
      ...heygen.voices.map((voice) => ({
        label: `${voice.name} (HeyGen · ${voice.ownership})`,
        value: heyGenVoiceValue(voice),
      })),
    ],
    [catalog, heygen.voices],
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
    const native =
      brand.agentConfig?.defaultAvatarRef ?? orgSettings?.defaultAvatarRef;
    if (native) return `${native.label} (HeyGen · ${native.ownership})`;
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
    brand.agentConfig?.defaultAvatarRef,
    orgSettings?.defaultAvatarRef,
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

      const native = heygen.avatars.find(
        (avatar) => heyGenAvatarValue(avatar.avatarRef) === selectedAvatarId,
      )?.avatarRef;
      if (selectedAvatarId.startsWith('heygen:') && !native?.readiness.usable)
        throw new Error('Reselect an available HeyGen look.');
      const providerVoice = heygen.voices.find(
        (voice) => heyGenVoiceValue(voice) === selectedVoiceId,
      );
      if (selectedVoiceId.startsWith('heygen:') && !providerVoice)
        throw new Error('Reselect an available HeyGen voice.');
      const service = await getBrandsService();
      await service.updateAgentConfig(brandId, {
        defaultAvatarRef: native ?? null,
        defaultAvatarIngredientId: native ? null : selectedAvatarId || null,
        defaultVoiceId: providerVoice ? null : (selectedVoice?.id ?? null),
        defaultVoiceRef: providerVoice
          ? heyGenDefaultVoice(providerVoice)
          : buildDefaultVoiceRefFromVoice(selectedVoice),
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
    heygen.avatars,
    heygen.voices,
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
    <Card
      data-testid="brand-identity-card"
      label={translate('brandLabel')}
      description={translate('brandDescription')}
    >
      <div className="flex flex-col gap-3">
        <BrandIdentityAvatarField
          avatars={avatars}
          providerAvatars={heygen.avatars}
          selectedAvatarId={selectedAvatarId}
          selectedAvatar={selectedAvatar}
          isLoadingAvatars={isLoadingAvatars}
          onAvatarChange={setSelectedAvatarId}
        />

        {heygen.error ? (
          <p role="status" className="text-xs text-muted-foreground">
            {heygen.error}
          </p>
        ) : null}
        {brand.agentConfig?.heygenAvatarId &&
        !brand.agentConfig.defaultAvatarRef ? (
          <p role="status" className="text-xs text-muted-foreground">
            {translate('reselectAvatar')}
          </p>
        ) : null}
        {brandDefaultVoiceRef?.provider === VoiceProvider.HEYGEN &&
        !brandDefaultVoiceRef.connection ? (
          <p role="status" className="text-xs text-muted-foreground">
            {translate('reselectVoice')}
          </p>
        ) : null}
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
          onBrowseAvatars={() =>
            router.push(libraryHref(APP_ROUTES.LIBRARY.AVATARS))
          }
          onBrowseVoices={() =>
            router.push(libraryHref(APP_ROUTES.LIBRARY.VOICES))
          }
        />
      </div>
    </Card>
  );
}
