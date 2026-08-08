'use client';

import { MODEL_BRANDS } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import type { ModelSelectorProviderSidebarProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import { Button } from '@ui/primitives/button';
import { History, LayoutGrid, Star } from 'lucide-react';
import { memo, useCallback } from 'react';

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
          'border-r border-border bg-background-secondary py-1',
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
  return (
    <Button
      ariaLabel={tooltip}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      // Rail sits on the left edge of the popover — open tooltips outward.
      tooltip={tooltip}
      tooltipPosition="left"
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
          style={accentColor ? { backgroundColor: accentColor } : undefined}
          aria-hidden
        />
      ) : null}
      {children}
    </Button>
  );
}

export default ModelSelectorProviderSidebar;
