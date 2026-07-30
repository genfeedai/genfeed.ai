'use client';

import { MODEL_BRANDS } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import type { ModelSelectorProviderSidebarProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import { Button } from '@ui/primitives/button';
import { LayoutGrid, Star } from 'lucide-react';
import { memo, useCallback } from 'react';

const ModelSelectorProviderSidebar = memo(
  function ModelSelectorProviderSidebar({
    brands,
    activeBrand,
    onBrandSelect,
    hasFavorites,
  }: ModelSelectorProviderSidebarProps) {
    const handleBrandClick = useCallback(
      (slug: string | null) => {
        onBrandSelect(slug);
      },
      [onBrandSelect],
    );

    return (
      <div className="flex w-14 flex-col items-center gap-1 overflow-y-auto border-r border-border py-2 sm:w-12">
        {hasFavorites && (
          <SidebarButton
            isActive={activeBrand === 'favorites'}
            onClick={() => handleBrandClick('favorites')}
            tooltip="Favorites"
            color="hsl(var(--foreground))"
          >
            <Star className="size-4" />
          </SidebarButton>
        )}

        <SidebarButton
          isActive={activeBrand === null}
          onClick={() => handleBrandClick(null)}
          tooltip="All"
          color="hsl(var(--muted-foreground))"
        >
          <LayoutGrid className="size-4" />
        </SidebarButton>

        <div className="my-0.5 h-px w-6 bg-border" />

        {brands.map((brand) => {
          const config = MODEL_BRANDS[brand.slug];
          const BrandIcon = getModelBrandIcon(config?.iconKey);

          return (
            <SidebarButton
              key={brand.slug}
              isActive={activeBrand === brand.slug}
              onClick={() => handleBrandClick(brand.slug)}
              tooltip={brand.label}
              color={brand.color}
            >
              {BrandIcon ? (
                <BrandIcon className="size-3.5" />
              ) : (
                <span className="text-[10px] font-bold leading-none">
                  {brand.label.charAt(0)}
                </span>
              )}
            </SidebarButton>
          );
        })}
      </div>
    );
  },
);

function SidebarButton({
  children,
  isActive,
  onClick,
  tooltip,
  color,
}: {
  children: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  tooltip: string;
  color: string;
}) {
  return (
    <Button
      ariaLabel={tooltip}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      tooltip={tooltip}
      className={cn(
        'relative flex size-11 items-center justify-center rounded transition-[background-color,color] lg:size-8',
        isActive
          ? 'bg-accent'
          : 'text-foreground/50 hover:bg-accent hover:text-foreground/80',
      )}
      style={isActive ? { color } : undefined}
    >
      {isActive && (
        <div
          className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </Button>
  );
}

export default ModelSelectorProviderSidebar;
