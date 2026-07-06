'use client';

import { createBrandAppRoute } from '@genfeedai/constants';
import { useBrandOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { getBrandOrganizationSlug } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthUser } from '@genfeedai/hooks/auth/use-auth-user/use-auth-user';
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

  const { user } = useAuthUser();
  const { openBrandOverlay } = useBrandOverlay();
  const { push } = useRouter();
  const [isUpdatingBrand, setIsUpdatingBrand] = useState(false);

  const isUpdating = externalIsUpdating ?? isUpdatingBrand;
  const selectedBrand = brands.find((b) => b.id === brandId);
  const selectedBrandLabel = selectedBrand?.label || 'Select Brand';
  const avatarSizeClassName = variant === 'labeled' ? 'size-6' : 'size-8';

  const handleSelect = useCallback(
    async (id: string) => {
      const url = `PATCH /brands/${id}`;
      try {
        setIsUpdatingBrand(true);
        const service = await getUsersService();
        await service.patchMeBrand(id, { isSelected: true });
        logger.info(`${url} success`);
        onBrandChange?.(id);
        const reloadPromise = user?.reload();
        if (reloadPromise) {
          void reloadPromise.catch((reloadError: unknown) => {
            logger.warn(`${url} reload failed`, reloadError);
          });
        }
      } catch (error) {
        logger.error(`${url} failed`, error);
      } finally {
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
                  onAction: () =>
                    push(createBrandAppRoute(orgSlug, b.slug, '/settings')),
                }
              : undefined,
        };
      })}
      renderTrigger={({ isOpen }) => (
        <Button
          type="button"
          data-testid="brand-switcher-trigger"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className={cn(
            'transition-all',
            'hover:bg-foreground/10 transition-colors duration-200',
            variant === 'labeled'
              ? 'flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left'
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
                'flex flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-background',
                avatarSizeClassName,
              )}
            >
              <Image
                src={selectedBrand.logoUrl}
                alt={selectedBrand.label ?? 'Brand'}
                width={variant === 'labeled' ? 24 : 32}
                height={variant === 'labeled' ? 24 : 32}
                className="size-full object-cover object-center"
                sizes={variant === 'labeled' ? '24px' : '32px'}
              />
            </div>
          ) : (
            <div
              className={cn(
                'flex flex-shrink-0 items-center justify-center rounded-md bg-foreground/20 font-semibold text-foreground',
                variant === 'labeled' ? 'size-6 text-xs' : 'size-8 text-sm',
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
      minWidth={variant === 'labeled' ? 224 : 220}
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
