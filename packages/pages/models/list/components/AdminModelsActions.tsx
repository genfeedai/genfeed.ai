'use client';

import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { openModal } from '@helpers/ui/modal/modal.helper';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import { Button } from '@ui/primitives/button';
import { SHELL_ICON_CLASS } from '@ui-constants/shell-chrome.constant';
import { Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

export default function AdminModelsActions() {
  const translate = useTranslations('pages.models');
  const { replace } = useRouter();
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
    <>
      <AdminOrgBrandFilter
        organization={adminOrg}
        brand={adminBrand}
        onOrganizationChange={handleAdminOrgChange}
        onBrandChange={handleAdminBrandChange}
      />
      <Button
        ariaLabel={translate('newModel')}
        icon={<Plus className={SHELL_ICON_CLASS} />}
        onClick={() => openModal(ModalEnum.MODEL)}
        size={ButtonSize.SM}
        variant={ButtonVariant.DEFAULT}
        withWrapper={false}
      >
        {translate('model')}
      </Button>
    </>
  );
}
