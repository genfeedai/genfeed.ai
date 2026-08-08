'use client';

import { MODEL_BRANDS } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import type { ModelSelectorProviderSidebarProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import { Button } from '@ui/primitives/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ui/primitives/tooltip';
import { History, LayoutGrid, Star } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

/**
 * Left brand rail — filter by favorites / all / provider / legacy.
 * Shown in both agent single and studio multi pickers.
 */
const ModelSelectorProviderSidebar = memo(
  function ModelSelectorProviderSidebar({
    brands,
    activeBrand,
    onBrandSelect,
    hasFavorites,
    hasLegacy = false,
  }: ModelSelectorProviderSidebarProps) {
    const handleBrandClick = useCallback(
      (slug: string | null) => {
        onBrandSelect(slug);
      },
      [onBrandSelect],
    );

    return (
      <nav
        aria-label="Filter by model provider"
        className={cn(
          'flex w-10 shrink-0 flex-col items-center gap-0.5 overflow-y-auto',
          // Same surface as the picker body — never a gray secondary strip.
          'border-r border-border bg-card py-1',
        )}
      >
        {hasFavorites ? (
          <SidebarButton
            isActive={activeBrand === 'favorites'}
            onClick={() => handleBrandClick('favorites')}
            tooltip="Favorites"
          >
            <Star className="size-3.5" />
          </SidebarButton>
        ) : null}

        <SidebarButton
          isActive={activeBrand === null}
          onClick={() => handleBrandClick(null)}
          tooltip="All providers"
        >
          <LayoutGrid className="size-3.5" />
        </SidebarButton>

        {brands.length > 0 ? (
          <div className="my-0.5 h-px w-4 shrink-0 bg-border" aria-hidden />
        ) : null}

        {brands.map((brand) => {
          const config = MODEL_BRANDS[brand.slug];
          const BrandIcon = getModelBrandIcon(config?.iconKey);

          return (
            <SidebarButton
              key={brand.slug}
              isActive={activeBrand === brand.slug}
              onClick={() => handleBrandClick(brand.slug)}
              tooltip={brand.label}
              accentColor={brand.color}
            >
              {BrandIcon ? (
                <BrandIcon className="size-3.5" />
              ) : (
                <span className="text-[10px] font-semibold leading-none">
                  {brand.label.charAt(0)}
                </span>
              )}
            </SidebarButton>
          );
        })}

        {hasLegacy ? (
          <>
            <div className="my-0.5 h-px w-4 shrink-0 bg-border" aria-hidden />
            <SidebarButton
              isActive={activeBrand === 'legacy'}
              onClick={() => handleBrandClick('legacy')}
              tooltip="Legacy models"
            >
              <History className="size-3.5" />
            </SidebarButton>
          </>
        ) : null}
      </nav>
    );
  },
);

/**
 * Hover-only tooltips. Button's built-in tooltip also opens on focus, and the
 * popover's open autofocus used to land on "All providers" — so the label
 * appeared the moment the picker opened. Pointer enter/leave only.
 */
function SidebarButton({
  children,
  isActive,
  onClick,
  tooltip,
  accentColor,
}: {
  children: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  tooltip: string;
  accentColor?: string;
}) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <TooltipProvider delayDuration={250} disableHoverableContent>
      <Tooltip open={isHovering}>
        <TooltipTrigger asChild>
          <Button
            ariaLabel={tooltip}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={onClick}
            onPointerEnter={() => setIsHovering(true)}
            onPointerLeave={() => setIsHovering(false)}
            className={cn(
              'relative flex size-7 shrink-0 items-center justify-center rounded-md',
              'transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground/55 hover:bg-accent/70 hover:text-foreground',
            )}
            style={isActive && accentColor ? { color: accentColor } : undefined}
          >
            {isActive ? (
              <span
                className="absolute inset-y-1 left-0 w-0.5 rounded-r-full bg-primary"
                style={
                  accentColor ? { backgroundColor: accentColor } : undefined
                }
                aria-hidden
              />
            ) : null}
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ModelSelectorProviderSidebar;
