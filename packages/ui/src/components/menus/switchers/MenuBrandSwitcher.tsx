'use client';

import { useUser } from '@clerk/nextjs';
import { useBrandOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { getBrandOrganizationSlug } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { BrandSwitcherProps } from '@genfeedai/props/social/brand-switcher.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { HiChevronDown, HiOutlineCog6Tooth } from 'react-icons/hi2';

export default function MenuBrandSwitcher({
  brands,
  brandId,
  isUpdatingBrand: externalIsUpdating,
  onBrandChange,
  variant = 'avatar',
}: BrandSwitcherProps) {
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const { user } = useUser();
  const { openBrandOverlay } = useBrandOverlay();
  const { push } = useRouter();
  const [isUpdatingBrand, setIsUpdatingBrand] = useState(false);

  const isUpdating = externalIsUpdating ?? isUpdatingBrand;
  const selectedBrand = brands.find((b) => b.id === brandId);
  const selectedBrandLabel = selectedBrand?.label || 'Select Brand';
  const avatarSizeClassName = variant === 'labeled' ? 'size-5' : 'size-8';

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
      className={variant === 'labeled' ? 'w-full' : 'w-full flex justify-end'}
      items={brands.map((b) => {
        const label = `${b.label ?? 'Untitled'}${b.isDarkroomEnabled ? ' · Darkroom' : ''}`;
        const orgSlug = getBrandOrganizationSlug(b);

        return {
          id: b.id,
          imageUrl: b.logoUrl || undefined,
          isActive: b.id === brandId,
          label,
          trailingAction:
            orgSlug && b.slug
              ? {
                  ariaLabel: `Open ${b.label ?? 'brand'} settings`,
                  icon: HiOutlineCog6Tooth,
                  onAction: () => push(`/${orgSlug}/${b.slug}/settings`),
                }
              : undefined,
        };
      })}
      renderTrigger={({ isOpen }) => (
        <Button
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className={cn(
            'transition-all',
            'hover:bg-foreground/10 transition-colors duration-200',
            variant === 'labeled'
              ? 'flex h-7 min-w-0 w-full items-center gap-2 rounded-md px-2 text-left'
              : 'flex items-center justify-center p-1',
            isUpdating && 'opacity-50 cursor-not-allowed',
            isOpen && 'bg-foreground/10',
          )}
          ariaLabel="Switch brand"
          title={selectedBrandLabel}
        >
          {selectedBrand?.logoUrl && selectedBrand.logoUrl !== '' ? (
            <div
              className={cn(
                'rounded-full overflow-hidden bg-background flex items-center justify-center flex-shrink-0',
                avatarSizeClassName,
              )}
            >
              <Image
                src={selectedBrand.logoUrl}
                alt={selectedBrand.label ?? 'Brand'}
                width={variant === 'labeled' ? 20 : 32}
                height={variant === 'labeled' ? 20 : 32}
                className="object-cover object-center"
                sizes={variant === 'labeled' ? '20px' : '32px'}
                style={{ height: 'auto', width: 'auto' }}
              />
            </div>
          ) : (
            <div
              className={cn(
                'rounded-full bg-foreground/20 flex items-center justify-center font-semibold text-foreground flex-shrink-0',
                variant === 'labeled' ? 'size-5 text-[10px]' : 'size-8 text-sm',
              )}
            >
              {selectedBrandLabel.charAt(0).toUpperCase()}
            </div>
          )}
          {variant === 'labeled' ? (
            <>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                {isUpdating ? 'Switching…' : selectedBrandLabel}
              </span>
              <HiChevronDown
                className={cn(
                  'size-3.5 flex-shrink-0 text-foreground/45 transition-transform duration-200',
                  isOpen && 'rotate-180',
                )}
              />
            </>
          ) : null}
        </Button>
      )}
      onSelect={(id) => void handleSelect(id)}
      isDisabled={isUpdating}
      hasSearch={brands.length >= 5}
      minWidth={variant === 'labeled' ? 260 : 220}
      searchPlaceholder="Search brands…"
      footerActions={[
        {
          label: 'New Brand',
          onAction: () => openBrandOverlay(null),
        },
      ]}
    />
  );
}
