'use client';

import { AssetScope, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { IArticle, IIngredient } from '@genfeedai/interfaces';
import type { ScopeDropdownProps } from '@genfeedai/props/social/scope-dropdown.props';
import { ArticlesService } from '@genfeedai/services/content/articles.service';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { Dropdown } from '@ui/primitives/dropdown';
import { SCOPE_OPTIONS } from '@ui-constants/scope.constant';
import { useMemo, useState } from 'react';
import {
  HiBuildingOffice,
  HiCheck,
  HiGlobeAlt,
  HiLockClosed,
  HiUsers,
} from 'react-icons/hi2';

const SCOPE_ICONS: Record<AssetScope, React.ReactNode> = {
  [AssetScope.USER]: <HiLockClosed className="w-4 h-4" />,
  [AssetScope.BRAND]: <HiUsers className="w-4 h-4" />,
  [AssetScope.ORGANIZATION]: <HiBuildingOffice className="w-4 h-4" />,
  [AssetScope.PUBLIC]: <HiGlobeAlt className="w-4 h-4" />,
};

const VARIANT_COLORS: Record<string, string> = {
  error: 'bg-error/20 text-error',
  info: 'bg-info/20 text-info',
  warning: 'bg-warning/20 text-warning',
};

export default function DropdownScope({
  item,
  className = '',
  position = 'auto',
  onScopeChange,
}: ScopeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const notifications = NotificationsService.getInstance();

  // Determine if this is an article or ingredient
  const isArticle = 'slug' in item && 'readingTime' in item;

  // Use appropriate service
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const getArticlesService = useAuthedService((token: string) =>
    ArticlesService.getInstance(token),
  );

  // Get current scope value
  const currentScope = item.scope || AssetScope.USER;

  const handleChange = async (newScope: AssetScope) => {
    try {
      let updatedItem: IIngredient | IArticle | undefined;

      if (isArticle) {
        // Use articles service
        const service = await getArticlesService();
        updatedItem = (await service.patch(item.id, {
          scope: newScope,
        })) as IArticle | undefined;
      } else {
        // Use ingredients service
        const service = await getIngredientsService();
        updatedItem = (await service.patch(item.id, {
          scope: newScope,
        })) as IIngredient | undefined;
      }

      // Emit the full updated item to parent
      onScopeChange?.(newScope, updatedItem);

      // Show success notification
      const scopeMeta = SCOPE_OPTIONS.find((opt) => opt.value === newScope);
      notifications.success(`Scope updated to ${scopeMeta?.label}`);
    } catch (err) {
      logger.error('Failed to update scope', err);
      notifications.error('Failed to update scope');
    } finally {
      setIsOpen(false);
    }
  };

  const currentMeta = useMemo(
    () =>
      SCOPE_OPTIONS.find((opt) => opt.value === currentScope) ||
      SCOPE_OPTIONS[0],
    [currentScope],
  );

  // Check if we should render icon-only mode (when className includes rounded-full)
  const isIconOnly = className.includes('rounded-full');

  function getActiveIconColorClass(variant: string): string {
    const v = variant.toLowerCase();
    for (const [key, value] of Object.entries(VARIANT_COLORS)) {
      if (v.includes(key)) {
        return value;
      }
    }
    return 'bg-muted text-foreground';
  }

  function getScopeIcon(scope: AssetScope): React.ReactNode {
    return SCOPE_ICONS[scope] ?? SCOPE_ICONS[AssetScope.USER];
  }

  return (
    <Dropdown
      className={className}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      position={position}
      usePortal={true}
      minWidth="180px"
      trigger={
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          aria-expanded={isOpen}
          ariaLabel={`Privacy: ${currentMeta.label} - Click to change`}
          tooltip={`Privacy: ${currentMeta.label}`}
          tooltipPosition="top"
          className={
            isIconOnly
              ? cn(className, 'relative')
              : cn(
                  'inline-flex items-center px-2.5 py-0.5 text-xs font-medium uppercase',
                  'hover:opacity-80 transition-opacity cursor-pointer',
                  'border hover:border-current/20',
                  currentMeta.variant,
                )
          }
        >
          {isIconOnly ? (
            <div className="relative">
              {getScopeIcon(currentScope)}
              {/* Privacy indicator dot - shows current privacy level color */}
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background',
                  currentScope === AssetScope.PUBLIC && 'bg-purple-500',
                  currentScope === AssetScope.ORGANIZATION && 'bg-green-500',
                  currentScope === AssetScope.BRAND && 'bg-blue-500',
                  currentScope === AssetScope.USER && 'bg-muted-foreground',
                )}
              />
            </div>
          ) : (
            currentMeta.label
          )}
        </Button>
      }
    >
      {SCOPE_OPTIONS.map((opt) => {
        const isActive = opt.value === currentScope;
        const scopeIcon = getScopeIcon(opt.value);

        return (
          <Button
            key={opt.value}
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              'flex items-center gap-3 w-full px-4 py-2.5 text-sm',
              'font-medium transition-all duration-150 cursor-pointer',
              'hover:bg-background/80 active:scale-[0.98]',
              isActive && 'bg-background/60',
            )}
            onClick={(e) => {
              e.stopPropagation();
              handleChange(opt.value);
            }}
          >
            {/* Scope Icon */}
            <div
              className={cn(
                'flex-shrink-0 w-4 h-4 flex items-center justify-center',
                'transition-colors duration-150',
                isActive
                  ? getActiveIconColorClass(opt.variant)
                  : 'text-foreground/50',
              )}
            >
              {scopeIcon}
            </div>

            {/* Scope Label */}
            <span
              className={cn(
                'flex-1 text-left capitalize',
                isActive
                  ? 'text-foreground font-semibold'
                  : 'text-foreground/80',
              )}
            >
              {opt.label}
            </span>

            {/* Active Indicator */}
            {isActive && (
              <HiCheck
                size={18}
                className="flex-shrink-0 text-success"
                aria-hidden="true"
              />
            )}
          </Button>
        );
      })}
    </Dropdown>
  );
}
