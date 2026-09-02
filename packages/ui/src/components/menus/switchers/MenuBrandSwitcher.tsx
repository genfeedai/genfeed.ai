'use client';

import { useBrandOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { getBrandOrganizationSlug } from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { ButtonVariant } from '@genfeedai/contracts';
import { createBrandAppRoute } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { BrandSwitcherProps } from '@genfeedai/props/social/brand-switcher.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import {
  SWITCHER_AVATAR_CLASSNAME,
  SWITCHER_CHEVRON_CLASSNAME,
  SWITCHER_COMPOSITE_CLEAR_CLASSNAME,
  SWITCHER_COMPOSITE_CLEAR_VISIBLE_CLASSNAME,
  SWITCHER_COMPOSITE_SHELL_CLASSNAME,
  SWITCHER_COMPOSITE_TRIGGER_CLASSNAME,
  SWITCHER_LABEL_CLASSNAME,
  SWITCHER_TRIGGER_CLASSNAME,
  SWITCHER_TRIGGER_OPEN_CLASSNAME,
} from '@ui/menus/switchers/switcher-trigger.classes';
import { Button } from '@ui/primitives/button';
import { ChevronsUpDown, Settings, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type MouseEvent, useCallback, useState } from 'react';

export default function MenuBrandSwitcher({
  brands,
  brandId,
  clearSelectionAction,
  isUpdatingBrand: externalIsUpdating,
  onBrandChange,
  variant = 'avatar',
}: BrandSwitcherProps) {
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const { openBrandOverlay } = useBrandOverlay();
  const { push } = useRouter();
  const [isUpdatingBrand, setIsUpdatingBrand] = useState(false);

  const isUpdating = externalIsUpdating ?? isUpdatingBrand;
  const selectedBrand = brands.find((b) => b.id === brandId);
  const selectedBrandLabel = selectedBrand?.label || 'Select Brand';
  const shouldShowClearSelection =
    variant === 'labeled' && Boolean(clearSelectionAction) && Boolean(brandId);

  const handleSelect = useCallback(
    async (id: string) => {
      const url = `PATCH /brands/${id}`;
      try {
        setIsUpdatingBrand(true);
        const service = await getUsersService();
        await service.patchMeBrand(id, { isSelected: true });
        logger.info(`${url} success`);
        onBrandChange?.(id);
      } catch (error) {
        logger.error(`${url} failed`, error);
      } finally {
        setIsUpdatingBrand(false);
      }
    },
    [getUsersService, onBrandChange],
  );

  const handleClearSelection = useCallback(async () => {
    if (!clearSelectionAction || isUpdating) {
      return;
    }

    const url = 'PATCH /users/me';
    try {
      setIsUpdatingBrand(true);
      const service = await getUsersService();
      await service.clearMeBrandSelection();
      logger.info(`${url} success`);
      clearSelectionAction.onSelect();
    } catch (error) {
      logger.error(`${url} failed`, error);
    } finally {
      setIsUpdatingBrand(false);
    }
  }, [clearSelectionAction, getUsersService, isUpdating]);

  const handleClearButtonClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void handleClearSelection();
    },
    [handleClearSelection],
  );

  if (brands.length === 0) {
    return null;
  }

  const items = [
    ...brands.map((b) => {
      const label = `${b.label ?? 'Untitled'}${b.isFleetEnabled ? ' · Fleet' : ''}`;
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
                icon: Settings,
                onAction: () =>
                  push(createBrandAppRoute(orgSlug, b.slug, '/settings')),
              }
            : undefined,
      };
    }),
  ];

  const brandAvatar =
    selectedBrand?.logoUrl && selectedBrand.logoUrl !== '' ? (
      <div className={SWITCHER_AVATAR_CLASSNAME}>
        <Image
          src={selectedBrand.logoUrl}
          alt={selectedBrand.label ?? 'Brand'}
          width={24}
          height={24}
          className="size-full object-cover object-center"
          sizes="24px"
        />
      </div>
    ) : (
      <div className={SWITCHER_AVATAR_CLASSNAME}>
        {selectedBrandLabel.charAt(0).toUpperCase()}
      </div>
    );

  const labeledTrigger = (isOpen: boolean) => (
    <Button
      type="button"
      data-testid="brand-switcher-trigger"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      className={cn(
        shouldShowClearSelection
          ? SWITCHER_COMPOSITE_TRIGGER_CLASSNAME
          : SWITCHER_TRIGGER_CLASSNAME,
        isUpdating && 'cursor-not-allowed opacity-50',
        !shouldShowClearSelection && isOpen && SWITCHER_TRIGGER_OPEN_CLASSNAME,
      )}
      ariaLabel="Switch brand"
      title={selectedBrandLabel}
    >
      {brandAvatar}
      <span className={SWITCHER_LABEL_CLASSNAME}>
        {isUpdating ? 'Switching…' : selectedBrandLabel}
      </span>
      <ChevronsUpDown className={SWITCHER_CHEVRON_CLASSNAME} />
    </Button>
  );

  if (variant !== 'labeled') {
    return (
      <div className="flex w-full min-w-0 items-center justify-end">
        <SwitcherDropdown
          className="flex w-full justify-end"
          items={items}
          renderTrigger={({ isOpen }) => (
            <Button
              type="button"
              data-testid="brand-switcher-trigger"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className={cn(
                'flex items-center justify-center rounded-md p-1 transition-colors duration-150 hover:bg-foreground/[0.06]',
                isUpdating && 'cursor-not-allowed opacity-50',
                isOpen && SWITCHER_TRIGGER_OPEN_CLASSNAME,
              )}
              ariaLabel="Switch brand"
              title={selectedBrandLabel}
            >
              {brandAvatar}
            </Button>
          )}
          onSelect={(id) => void handleSelect(id)}
          isDisabled={isUpdating}
          hasSearch={items.length >= 5}
          minWidth={220}
          searchPlaceholder="Search brands…"
          footerActions={[
            {
              label: 'New Brand',
              onAction: () => openBrandOverlay(null),
            },
          ]}
        />
      </div>
    );
  }

  // Labeled: one chip — trigger (+ optional clear) share one shell so the X
  // is not a second bordered box.
  return (
    <SwitcherDropdown
      className="w-full"
      items={items}
      renderTrigger={({ isOpen }) =>
        shouldShowClearSelection ? (
          <div
            className={cn(
              SWITCHER_COMPOSITE_SHELL_CLASSNAME,
              isOpen && SWITCHER_TRIGGER_OPEN_CLASSNAME,
              isUpdating && 'opacity-50',
            )}
          >
            {labeledTrigger(isOpen)}
            <Button
              type="button"
              data-testid="clear-brand-selection"
              ariaLabel={
                clearSelectionAction?.ariaLabel ?? 'Clear brand selection'
              }
              title={clearSelectionAction?.ariaLabel ?? 'Clear brand selection'}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              isDisabled={isUpdating}
              onClick={handleClearButtonClick}
              className={cn(
                SWITCHER_COMPOSITE_CLEAR_CLASSNAME,
                isOpen && SWITCHER_COMPOSITE_CLEAR_VISIBLE_CLASSNAME,
              )}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          labeledTrigger(isOpen)
        )
      }
      onSelect={(id) => void handleSelect(id)}
      isDisabled={isUpdating}
      hasSearch={items.length >= 5}
      minWidth={224}
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
