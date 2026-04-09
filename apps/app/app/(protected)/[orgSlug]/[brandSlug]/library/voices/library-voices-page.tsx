'use client';

import { useIngredientsContext } from '@contexts/content/ingredients-context/ingredients-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { PageScope, VoiceProvider } from '@genfeedai/enums';
import {
  buildDefaultVoiceRefFromVoice,
  type DefaultVoiceRef,
  matchesDefaultVoice,
} from '@helpers/voice/default-voice-ref.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import type { Voice } from '@models/ingredients/voice.model';
import IngredientsLayout from '@pages/ingredients/layout/ingredients-layout';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import VoiceCatalogList from '@pages/library/voices/voice-catalog-list';
import VoiceCatalogRow from '@pages/library/voices/voice-catalog-row';
import { useUploadModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { VoiceCloneService } from '@services/ingredients/voice-clone.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SelectedBrandState = {
  agentConfig?: {
    defaultVoiceId?: string | null;
    defaultVoiceRef?: DefaultVoiceRef | null;
  };
  label?: string;
};

const PAGE_SIZE = 12;

function isVoiceRemovable(voice: Voice): boolean {
  return voice.isCloned === true || voice.voiceSource === 'cloned';
}

function VoiceLibrarySkeleton() {
  return (
    <div className="space-y-3" data-testid="voice-row-skeleton">
      {Array.from({ length: 6 }, (_, index) => index + 1).map((slot) => (
        <div
          key={`voice-row-skeleton-${slot}`}
          className="h-20 animate-pulse rounded-2xl border border-white/[0.08] bg-white/[0.03]"
        />
      ))}
    </div>
  );
}

function LibraryVoicesContent() {
  const notifications = NotificationsService.getInstance();
  const { filters, onRefresh, query } = useIngredientsContext();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { closeUpload, openUpload } = useUploadModal();
  const { brandId, organizationId, refreshBrands, selectedBrand } = useBrand();
  const selectedBrandState = selectedBrand as SelectedBrandState | undefined;
  const { refresh: refreshSettings, settings } = useOrganization();
  const orgDefaultVoiceRef = settings?.defaultVoiceRef as
    | DefaultVoiceRef
    | null
    | undefined;
  const currentPage = Number(searchParams?.get('page')) || 1;

  const getVoiceCloneService = useAuthedService((token: string) =>
    VoiceCloneService.getInstance(token),
  );
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [isSavingOrgDefault, setIsSavingOrgDefault] = useState(false);
  const [isSavingBrandDefault, setIsSavingBrandDefault] = useState(false);

  const providerQuery = useMemo(
    () =>
      typeof query.provider === 'string' &&
      Object.values(VoiceProvider).includes(query.provider as VoiceProvider)
        ? [query.provider as VoiceProvider]
        : undefined,
    [query.provider],
  );

  const statusQuery = useMemo(() => {
    if (Array.isArray(query.status)) {
      return query.status.length > 0 ? query.status : undefined;
    }

    return typeof query.status === 'string' && query.status.length > 0
      ? [query.status]
      : undefined;
  }, [query.status]);

  const searchQuery = useMemo(
    () =>
      typeof query.search === 'string' && query.search.length > 0
        ? query.search
        : undefined,
    [query.search],
  );

  const {
    isLoading: isLoadingVoices,
    refresh: refreshVoices,
    voices,
  } = useVoiceCatalog({
    isActive: true,
    limit: PAGE_SIZE,
    page: currentPage,
    pagination: true,
    providers: providerQuery,
    search: searchQuery,
    status: statusQuery,
  });

  const hasActiveFilters = useMemo(
    () =>
      Boolean(filters.provider) ||
      Boolean(filters.search) ||
      Boolean(filters.sort) ||
      Boolean(filters.type) ||
      (Array.isArray(filters.status) && filters.status.length > 0),
    [
      filters.provider,
      filters.search,
      filters.sort,
      filters.status,
      filters.type,
    ],
  );

  const handleOpenCloneModal = useCallback(() => {
    openUpload({
      category: 'voice',
      isMultiple: false,
      maxFiles: 1,
      onConfirm: () => {
        closeUpload();
        refreshVoices().catch((error) => {
          logger.error('Failed to refresh voices after clone', error);
        });
      },
    });
  }, [closeUpload, openUpload, refreshVoices]);

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.delete('provider');
    params.delete('search');
    params.delete('sort');
    params.delete('type');
    params.delete('status');
    params.delete('page');
    const nextQuery = params.toString();

    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    onRefresh?.(() => {
      refreshVoices().catch((error) => {
        logger.error('Failed to refresh voices', error);
      });
    });
  }, [onRefresh, refreshVoices]);

  const saveOrganizationDefault = useCallback(
    async (voice: Voice | null) => {
      if (!organizationId) {
        notifications.error('Organization context is unavailable');
        return;
      }

      setIsSavingOrgDefault(true);

      try {
        const service = await getOrganizationsService();
        const defaultVoiceRef = buildDefaultVoiceRefFromVoice(voice);

        await service.patchSettings(organizationId, {
          defaultVoiceId: voice?.id ?? null,
          defaultVoiceProvider:
            (voice?.provider as VoiceProvider | undefined) ?? null,
          defaultVoiceRef,
        });
        await refreshSettings();
        notifications.success('Organization default voice updated');
      } catch (error) {
        logger.error('Failed to save organization default voice', error);
        notifications.error('Failed to save organization default voice');
      } finally {
        setIsSavingOrgDefault(false);
      }
    },
    [getOrganizationsService, notifications, organizationId, refreshSettings],
  );

  const saveBrandDefault = useCallback(
    async (voice: Voice | null) => {
      if (!brandId) {
        notifications.error('Brand context is unavailable');
        return;
      }

      setIsSavingBrandDefault(true);

      try {
        const service = await getBrandsService();
        const defaultVoiceRef = buildDefaultVoiceRefFromVoice(voice);

        await service.updateAgentConfig(brandId, {
          defaultVoiceId: voice?.id ?? null,
          defaultVoiceRef,
        });
        await refreshBrands();
        notifications.success('Brand default voice updated');
      } catch (error) {
        logger.error('Failed to save brand default voice', error);
        notifications.error('Failed to save brand default voice');
      } finally {
        setIsSavingBrandDefault(false);
      }
    },
    [brandId, getBrandsService, notifications, refreshBrands],
  );

  const handleDeleteVoice = useCallback(
    async (voice: Voice) => {
      try {
        const service = await getVoiceCloneService();
        await service.deleteClonedVoice(voice.id);

        const needsOrgReset = matchesDefaultVoice(
          {
            defaultVoiceId: settings?.defaultVoiceId,
            defaultVoiceRef: orgDefaultVoiceRef,
          },
          voice,
        );
        const needsBrandReset = matchesDefaultVoice(
          {
            defaultVoiceId: selectedBrandState?.agentConfig?.defaultVoiceId,
            defaultVoiceRef: selectedBrandState?.agentConfig?.defaultVoiceRef,
          },
          voice,
        );

        if (needsOrgReset) {
          await saveOrganizationDefault(null);
        }

        if (needsBrandReset) {
          await saveBrandDefault(null);
        }

        notifications.success('Voice deleted');
        await refreshVoices();
      } catch (error) {
        logger.error('Failed to delete voice', error);
        notifications.error('Failed to delete voice');
      }
    },
    [
      getVoiceCloneService,
      notifications,
      orgDefaultVoiceRef,
      refreshVoices,
      saveBrandDefault,
      saveOrganizationDefault,
      selectedBrandState?.agentConfig?.defaultVoiceId,
      selectedBrandState?.agentConfig?.defaultVoiceRef,
      settings?.defaultVoiceId,
    ],
  );

  return (
    <div className="space-y-4">
      {!isLoadingVoices ? (
        <p className="text-sm text-muted-foreground">
          {voices.length} voice{voices.length === 1 ? '' : 's'} on this page
        </p>
      ) : null}

      {isLoadingVoices ? (
        <VoiceLibrarySkeleton />
      ) : (
        <VoiceCatalogList
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearFilters}
          onCloneVoice={handleOpenCloneModal}
          voices={voices}
        >
          {voices.map((voice) => {
            const isOrgDefault = matchesDefaultVoice(
              {
                defaultVoiceId: settings?.defaultVoiceId,
                defaultVoiceRef: orgDefaultVoiceRef,
              },
              voice,
            );
            const isBrandDefault = matchesDefaultVoice(
              {
                defaultVoiceId: selectedBrandState?.agentConfig?.defaultVoiceId,
                defaultVoiceRef:
                  selectedBrandState?.agentConfig?.defaultVoiceRef,
              },
              voice,
            );

            return (
              <VoiceCatalogRow
                key={voice.id}
                isBrandDefault={isBrandDefault}
                isOrgDefault={isOrgDefault}
                isSavingBrandDefault={isSavingBrandDefault}
                isSavingOrgDefault={isSavingOrgDefault}
                onDelete={
                  isVoiceRemovable(voice)
                    ? () => {
                        handleDeleteVoice(voice).catch((error) => {
                          logger.error('Failed to delete voice', error);
                        });
                      }
                    : null
                }
                onSaveBrandDefault={
                  selectedBrandState
                    ? () => {
                        saveBrandDefault(voice).catch((error) => {
                          logger.error(
                            'Failed to save brand default voice',
                            error,
                          );
                        });
                      }
                    : null
                }
                onSaveOrganizationDefault={() => {
                  saveOrganizationDefault(voice).catch((error) => {
                    logger.error(
                      'Failed to save organization default voice',
                      error,
                    );
                  });
                }}
                selectedBrandLabel={selectedBrandState?.label}
                voice={voice}
              />
            );
          })}
        </VoiceCatalogList>
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="voices" />
      </div>
    </div>
  );
}

export default function LibraryVoicesPage() {
  return (
    <IngredientsLayout
      scope={PageScope.BRAND}
      defaultType="voices"
      hideTypeTabs
    >
      <LibraryVoicesContent />
    </IngredientsLayout>
  );
}
