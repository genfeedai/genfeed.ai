'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { openModal } from '@helpers/ui/modal/modal.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Cpu, Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';

function ModelsLayoutContent({ children }: LayoutProps) {
  const { refresh, replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  function handleRefresh(): void {
    setIsRefreshing(true);
    refresh();
    setTimeout(() => setIsRefreshing(false), 500);
  }

  return (
    <Container
      label="Models"
      description="Manage AI models, their configurations, and availability settings"
      icon={Cpu}
      headerTabs={{
        fullWidth: false,
        tabs: [
          { href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/all`, label: 'All' },
          {
            href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/image`,
            label: 'Image',
          },
          {
            href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/video`,
            label: 'Video',
          },
          {
            href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/music`,
            label: 'Music',
          },
          { href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/text`, label: 'Text' },
          {
            href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/other`,
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
          <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />
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
    <Suspense fallback={null}>
      <ModelsLayoutContent {...props} />
    </Suspense>
  );
}
