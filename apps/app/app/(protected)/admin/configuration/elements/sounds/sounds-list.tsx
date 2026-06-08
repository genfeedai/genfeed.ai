'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum, PageScope } from '@genfeedai/enums';
import type { IQueryParams } from '@genfeedai/interfaces';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Sound } from '@models/ingredients/sound.model';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SoundsService } from '@services/elements/sounds.service';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';
import { buildSoundsColumns } from './sounds-list-columns.helpers';
import SoundsListModals from './sounds-list-modals';

function SoundsListContent({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const getSoundsService = useAuthedService(
    useCallback((token: string) => SoundsService.getInstance(token), []),
  );

  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const [sounds, setSounds] = useState<Sound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const [selectedSound, setSelectedSound] = useState<Sound | null>(null);

  // Admin org/brand filter state (superadmin only)
  const [adminOrg, setAdminOrg] = useState(
    () => parsedSearchParams.get('organization') || '',
  );
  const [adminBrand, setAdminBrand] = useState(
    () => parsedSearchParams.get('brand') || '',
  );

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      setAdminOrg(orgId);
      setAdminBrand('');
      const params = new URLSearchParams(searchParamsString);
      if (orgId) {
        params.set('organization', orgId);
      } else {
        params.delete('organization');
      }
      params.delete('brand');
      params.delete('page');
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  const handleAdminBrandChange = useCallback(
    (brandId: string) => {
      setAdminBrand(brandId);
      const params = new URLSearchParams(searchParamsString);
      if (brandId) {
        params.set('brand', brandId);
      } else {
        params.delete('brand');
      }
      params.delete('page');
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  const findAllSounds = useCallback(
    async (isRefresh = false) => {
      const newIsRefreshing = isRefresh;
      const newIsLoading = !isRefresh;

      setIsLoading(newIsLoading);

      // Notify parent of state changes
      onRefreshingChangeRef.current?.(newIsRefreshing);
      onLoadingChangeRef.current?.(newIsLoading);

      try {
        const service = await getSoundsService();

        // Build API query
        const query: IQueryParams = {
          limit: ITEMS_PER_PAGE,
          page: currentPage,
        };

        if (scope === PageScope.SUPERADMIN) {
          if (adminOrg) {
            query.organization = adminOrg;
          }
          if (adminBrand) {
            query.brand = adminBrand;
          }
        }

        const data = await service.findAll(query);
        setSounds(data);

        if (isRefresh) {
          notificationsService.success('Sounds refreshed');
        }

        logger.info('GET /sounds success', data);
      } catch (error) {
        logger.error('GET /sounds failed', error);
        notificationsService.error('Failed to load sounds');
      } finally {
        setIsLoading(false);
        onLoadingChangeRef.current?.(false);
        onRefreshingChangeRef.current?.(false);
      }
    },
    [
      currentPage,
      getSoundsService,
      notificationsService.error,
      notificationsService.success,
      scope,
      adminOrg,
      adminBrand,
    ],
  );

  // Fetch data on mount and when search params change
  useEffect(() => {
    findAllSounds();
  }, [findAllSounds]);
  const openSoundModal = (modalId: ModalEnum, sound?: Sound) => {
    setSelectedSound(sound || null);
    openModal(modalId);
  };

  const handleToggleActive = async (sound: Sound) => {
    setUpdatingIds((prev) => new Set([...prev, sound.id]));
    try {
      const service = await getSoundsService();
      await service.patch(sound.id, { isActive: !sound.isActive });
      notificationsService.success('Sound updated');
      findAllSounds(true);
    } catch (error) {
      logger.error('Failed to update sound', error);
      notificationsService.error('Failed to update sound');
    } finally {
      setUpdatingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(sound.id);
        return newSet;
      });
    }
  };

  const handleToggleDefault = async (sound: Sound) => {
    setUpdatingIds((prev) => new Set([...prev, sound.id]));
    try {
      const service = await getSoundsService();
      await service.patch(sound.id, { isDefault: !sound.isDefault });
      notificationsService.success('Sound updated');
      findAllSounds(true);
    } catch (error) {
      logger.error('Failed to update sound', error);
      notificationsService.error('Failed to update sound');
    } finally {
      setUpdatingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(sound.id);
        return newSet;
      });
    }
  };

  const handleDelete = async (sound: Sound) => {
    try {
      const service = await getSoundsService();
      await service.delete(sound.id);
      notificationsService.success('Sound deleted');
      setSelectedSound(null);
      findAllSounds(true);
    } catch (error) {
      logger.error('Failed to delete sound', error);
      notificationsService.error('Failed to delete sound');
      setSelectedSound(null);
    }
  };

  const columns = buildSoundsColumns({
    updatingIds,
    scope,
    onToggleActive: handleToggleActive,
    onToggleDefault: handleToggleDefault,
  });

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (sound: Sound) => openSoundModal(ModalEnum.SOUND, sound),
            tooltip: 'Edit',
          },
          {
            icon: <HiTrash />,
            onClick: (sound: Sound) => {
              setSelectedSound(sound);
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Sound',
                message: `Are you sure you want to delete "${sound.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(sound),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  return (
    <>
      {scope === PageScope.SUPERADMIN && (
        <div className="mb-4">
          <AdminOrgBrandFilter
            organization={adminOrg}
            brand={adminBrand}
            onOrganizationChange={handleAdminOrgChange}
            onBrandChange={handleAdminBrandChange}
          />
        </div>
      )}

      <AppTable<Sound>
        items={sounds}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No sounds found"
      />

      <SoundsListModals
        scope={scope}
        selectedSound={selectedSound}
        onConfirm={() => {
          setSelectedSound(null);
          findAllSounds(true);
        }}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="sounds" />
      </div>
    </>
  );
}

export default function SoundsList(
  props: Parameters<typeof SoundsListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <SoundsListContent {...props} />
    </Suspense>
  );
}
