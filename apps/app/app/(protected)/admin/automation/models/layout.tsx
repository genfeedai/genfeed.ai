'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import {
  ModelsProvider,
  useModelsContext,
} from '@contexts/models/models-context/models-context';
import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createFilterHref } from '@helpers/navigation/filter-href.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Cpu, Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo } from 'react';

function ModelsLayoutContent({ children }: LayoutProps) {
  const { replace } = useRouter();
  const { isRefreshing, refreshModels } = useModelsContext();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';

  const adminOrg = useMemo(
    () => new URLSearchParams(searchParamsString).get('organization') || '',
    [searchParamsString],
  );
  const adminBrand = useMemo(
    () => new URLSearchParams(searchParamsString).get('brand') || '',
    [searchParamsString],
  );

  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
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

  return (
    <Container
      label="Models"
      description="Manage AI models, their configurations, and availability settings"
      icon={Cpu}
      headerTabs={{
        activeTab: createFilterHref(
          APP_ROUTES.ADMIN.AUTOMATION.MODELS,
          searchParamsString,
          'type',
          searchParams?.get('type') ?? 'all',
        ),
        fullWidth: false,
        tabs: [
          {
            href: createFilterHref(
              APP_ROUTES.ADMIN.AUTOMATION.MODELS,
              searchParamsString,
              'type',
              'all',
            ),
            label: 'All',
          },
          {
            href: createFilterHref(
              APP_ROUTES.ADMIN.AUTOMATION.MODELS,
              searchParamsString,
              'type',
              'image',
            ),
            label: 'Image',
          },
          {
            href: createFilterHref(
              APP_ROUTES.ADMIN.AUTOMATION.MODELS,
              searchParamsString,
              'type',
              'video',
            ),
            label: 'Video',
          },
          {
            href: createFilterHref(
              APP_ROUTES.ADMIN.AUTOMATION.MODELS,
              searchParamsString,
              'type',
              'music',
            ),
            label: 'Music',
          },
          {
            href: createFilterHref(
              APP_ROUTES.ADMIN.AUTOMATION.MODELS,
              searchParamsString,
              'type',
              'text',
            ),
            label: 'Text',
          },
          {
            href: createFilterHref(
              APP_ROUTES.ADMIN.AUTOMATION.MODELS,
              searchParamsString,
              'type',
              'other',
            ),
            label: 'Other',
          },
        ],
      }}
      right={
        <>
          <AdminOrgBrandFilter
            organization={adminOrg}
            brand={adminBrand}
            onOrganizationChange={handleAdminOrgChange}
            onBrandChange={handleAdminBrandChange}
          />
          <ButtonRefresh
            onClick={() => refreshModels?.()}
            isRefreshing={isRefreshing}
          />
          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={() => openModal(ModalEnum.MODEL)}
          >
            <Plus />
            Model
          </Button>
        </>
      }
    >
      {children}
    </Container>
  );
}

export default function ModelsLayout(props: LayoutProps) {
  return (
    <ModelsProvider>
      <Suspense fallback={null}>
        <ModelsLayoutContent {...props} />
      </Suspense>
    </ModelsProvider>
  );
}
