'use client';

import { AssetScope } from '@genfeedai/contracts';
import type { IArticle, IIngredient } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { ScopeDropdownProps } from '@genfeedai/props/social/scope-dropdown.props';
import { ArticlesService } from '@genfeedai/services/content/articles.service';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { OptionSelect } from '@ui/primitives/option-select';
import { SCOPE_OPTIONS } from '@ui-constants/scope.constant';
import { Building, Globe, Lock, Users } from 'lucide-react';
import { useMemo } from 'react';

const SCOPE_ICONS: Record<AssetScope, React.ReactNode> = {
  [AssetScope.USER]: <Lock className="size-4" />,
  [AssetScope.BRAND]: <Users className="size-4" />,
  [AssetScope.ORGANIZATION]: <Building className="size-4" />,
  [AssetScope.PUBLIC]: <Globe className="size-4" />,
};

const SCOPE_DOT_CLASSES: Record<AssetScope, string> = {
  [AssetScope.USER]: 'bg-muted-foreground',
  [AssetScope.BRAND]: 'bg-categorical-blue',
  [AssetScope.ORGANIZATION]: 'bg-categorical-emerald',
  [AssetScope.PUBLIC]: 'bg-categorical-violet',
};

/** The scope's icon with a dot in the colour of its privacy level. */
function ScopeIcon({ scope }: { scope: AssetScope }) {
  return (
    <div className="relative">
      {getScopeIcon(scope)}
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-background',
          SCOPE_DOT_CLASSES[scope] ?? SCOPE_DOT_CLASSES[AssetScope.USER],
        )}
      />
    </div>
  );
}

function getScopeIcon(scope: AssetScope): React.ReactNode {
  return SCOPE_ICONS[scope] ?? SCOPE_ICONS[AssetScope.USER];
}

export default function DropdownScope({
  item,
  className = '',
  onScopeChange,
}: ScopeDropdownProps) {
  const notifications = NotificationsService.getInstance();

  // Determine if this is an article or ingredient
  const isArticle = 'slug' in item && 'readingTime' in item;

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const getArticlesService = useAuthedService((token: string) =>
    ArticlesService.getInstance(token),
  );

  const currentScope = item.scope || AssetScope.USER;

  const handleChange = async (newScope: AssetScope) => {
    try {
      let updatedItem: IIngredient | IArticle | undefined;

      if (isArticle) {
        const service = await getArticlesService();
        updatedItem = (await service.patch(item.id, {
          scope: newScope,
        })) as IArticle | undefined;
      } else {
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

  return (
    <OptionSelect
      ariaLabel={`Privacy: ${currentMeta.label} - Click to change`}
      className={
        isIconOnly
          ? cn(className, 'relative')
          : cn(
              'h-auto w-auto cursor-pointer border px-2.5 py-0.5 font-medium text-xs uppercase transition-opacity hover:opacity-80',
              currentMeta.variant,
              className,
            )
      }
      isIconOnly={isIconOnly}
      isIndicatorHidden
      onValueChange={(next) => void handleChange(next as AssetScope)}
      options={SCOPE_OPTIONS.map((option) => ({
        icon: <ScopeIcon scope={option.value} />,
        label: option.label,
        value: option.value,
      }))}
      value={currentScope}
    />
  );
}
