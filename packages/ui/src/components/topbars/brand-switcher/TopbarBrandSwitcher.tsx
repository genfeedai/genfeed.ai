'use client';

import { useUser } from '@clerk/nextjs';
import { useBrandOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { HiChevronDown, HiOutlineCog6Tooth } from 'react-icons/hi2';

export default function TopbarBrandSwitcher() {
  const { brands, brandId } = useBrand();
  const { user } = useUser();
  const { openBrandOverlay } = useBrandOverlay();
  const router = useRouter();
  const { orgSlug, orgHref } = useOrgUrl();

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const [isUpdatingBrand, setIsUpdatingBrand] = useState(false);

  const selectedBrand = brands.find((b) => b.id === brandId);

  const handleOpenBrandSettings = useCallback(() => {
    router.push(
      selectedBrand
        ? orgHref(`/settings/brands/${selectedBrand.id}`)
        : orgHref('/settings/brands'),
    );
  }, [router, selectedBrand, orgHref]);

  const handleSelect = useCallback(
    async (id: string) => {
      const url = `PATCH /brands/${id}`;
      try {
        setIsUpdatingBrand(true);
        const service = await getUsersService();
        await service.patchMeBrand(id, { isSelected: true });
        logger.info(`${url} success`);
        await user?.reload();

        const newBrand = brands.find((b) => b.id === id);
        if (newBrand?.slug) {
          router.push(`/${orgSlug}/${newBrand.slug}/workspace/overview`);
        } else {
          router.refresh();
        }

        setIsUpdatingBrand(false);
      } catch (error) {
        logger.error(`${url} failed`, error);
        setIsUpdatingBrand(false);
      }
    },
    [getUsersService, user, brands, router, orgSlug],
  );

  if (brands.length === 0) {
    return null;
  }

  return (
    <SwitcherDropdown
      className="flex items-center"
      items={brands.map((b) => ({
        id: b.id,
        imageUrl: b.logoUrl || undefined,
        isActive: b.id === brandId,
        label: `${b.label ?? 'Untitled'}${b.isDarkroomEnabled ? ' · Darkroom' : ''}`,
      }))}
      renderTrigger={({ isOpen }) => (
        <div
          data-testid="brand-switcher-trigger"
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 transition-all cursor-pointer',
            'hover:bg-white/[0.06]',
            isUpdatingBrand && 'opacity-50 cursor-not-allowed',
            isOpen && 'bg-white/[0.06]',
          )}
        >
          {selectedBrand?.logoUrl && selectedBrand.logoUrl !== '' ? (
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-background">
              <Image
                src={selectedBrand.logoUrl}
                alt={selectedBrand.label ?? 'Brand'}
                width={24}
                height={24}
                className="object-cover object-center"
                sizes="24px"
                style={{ height: 'auto', width: 'auto' }}
              />
            </div>
          ) : (
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
              {(selectedBrand?.label ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="hidden max-w-truncate-md truncate text-sm font-medium text-white/90 md:inline">
            {selectedBrand?.label ?? 'Select Brand'}
          </span>
          <HiChevronDown
            className={cn(
              'hidden h-3.5 w-3.5 flex-shrink-0 text-white/40 transition-transform duration-200 md:block',
              isOpen && 'rotate-180',
            )}
          />
        </div>
      )}
      onSelect={(id) => void handleSelect(id)}
      isDisabled={isUpdatingBrand}
      hasSearch={brands.length >= 5}
      searchPlaceholder="Search brands..."
      footerActions={[
        {
          icon: HiOutlineCog6Tooth,
          label: 'Settings',
          onAction: handleOpenBrandSettings,
        },
        {
          label: 'New Brand',
          onAction: () => openBrandOverlay(null),
        },
      ]}
    />
  );
}
