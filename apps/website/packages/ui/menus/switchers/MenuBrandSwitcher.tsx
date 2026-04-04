'use client';

import { useUser } from '@clerk/nextjs';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandSwitcherProps } from '@props/social/brand-switcher.props';
import { useBrandOverlay } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';

export default function MenuBrandSwitcher({
  brands,
  brandId,
  isUpdatingBrand: externalIsUpdating,
  onBrandChange,
}: BrandSwitcherProps) {
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const { user } = useUser();
  const { openBrandOverlay } = useBrandOverlay();
  const router = useRouter();
  const [isUpdatingBrand, setIsUpdatingBrand] = useState(false);

  const isUpdating = externalIsUpdating ?? isUpdatingBrand;
  const selectedBrand = brands.find((b) => b.id === brandId);

  const handleOpenBrandSettings = useCallback(() => {
    router.push(
      selectedBrand
        ? `/settings/brands/${selectedBrand.id}`
        : '/settings/brands',
    );
  }, [router, selectedBrand]);

  const handleSelect = useCallback(
    async (id: string) => {
      const url = `PATCH /brands/${id}`;
      try {
        setIsUpdatingBrand(true);
        const service = await getUsersService();
        await service.patchMeBrand(id, { isSelected: true });
        logger.info(`${url} success`);
        await user?.reload();
        onBrandChange?.(id);
        setIsUpdatingBrand(false);
      } catch (error) {
        logger.error(`${url} failed`, error);
        setIsUpdatingBrand(false);
      }
    },
    [getUsersService, onBrandChange, user],
  );

  if (brands.length === 0) {
    return null;
  }

  return (
    <SwitcherDropdown
      className="w-full flex justify-end"
      items={brands.map((b) => ({
        id: b.id,
        imageUrl: b.logoUrl || undefined,
        isActive: b.id === brandId,
        label: `${b.label ?? 'Untitled'}${b.isDarkroomEnabled ? ' · Darkroom' : ''}`,
      }))}
      renderTrigger={({ isOpen }) => (
        <div
          className={cn(
            'flex items-center justify-center p-1 transition-all cursor-pointer',
            'hover:bg-white/10 transition-colors duration-200',
            isUpdating && 'opacity-50 cursor-not-allowed',
            isOpen && 'bg-white/10',
          )}
          title={selectedBrand?.label || 'Select Brand'}
        >
          {selectedBrand?.logoUrl && selectedBrand.logoUrl !== '' ? (
            <div className="w-8 h-8 rounded-full overflow-hidden bg-background flex items-center justify-center">
              <Image
                src={selectedBrand.logoUrl}
                alt={selectedBrand.label ?? 'Brand'}
                width={32}
                height={32}
                className="object-cover object-center"
                sizes="32px"
                style={{ height: 'auto', width: 'auto' }}
              />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold text-white">
              {(selectedBrand?.label ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}
      onSelect={(id) => void handleSelect(id)}
      isDisabled={isUpdating}
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
