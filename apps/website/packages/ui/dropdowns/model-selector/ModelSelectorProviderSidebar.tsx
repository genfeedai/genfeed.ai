'use client';

import { MODEL_BRANDS } from '@genfeedai/constants/model-brands.constant';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ModelSelectorProviderSidebarProps } from '@props/ui/model-selector/model-selector.props';
import Button from '@ui/buttons/base/Button';
import { memo, useCallback } from 'react';
import { HiSquares2X2, HiStar } from 'react-icons/hi2';

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
      <div className="w-12 border-r border-white/10 flex flex-col items-center py-2 gap-1 overflow-y-auto">
        {hasFavorites && (
          <SidebarButton
            isActive={activeBrand === 'favorites'}
            onClick={() => handleBrandClick('favorites')}
            tooltip="Favorites"
            color="#EAB308"
          >
            <HiStar className="h-4 w-4" />
          </SidebarButton>
        )}

        <SidebarButton
          isActive={activeBrand === null}
          onClick={() => handleBrandClick(null)}
          tooltip="All"
          color="#9CA3AF"
        >
          <HiSquares2X2 className="h-4 w-4" />
        </SidebarButton>

        <div className="w-6 h-px bg-white/10 my-0.5" />

        {brands.map((brand) => {
          const config = MODEL_BRANDS[brand.slug];
          const BrandIcon = config?.icon;

          return (
            <SidebarButton
              key={brand.slug}
              isActive={activeBrand === brand.slug}
              onClick={() => handleBrandClick(brand.slug)}
              tooltip={brand.label}
              color={brand.color}
            >
              {BrandIcon ? (
                <BrandIcon className="h-3.5 w-3.5" />
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
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      tooltip={tooltip}
      className={cn(
        'w-8 h-8 rounded flex items-center justify-center transition-all relative',
        isActive
          ? 'bg-white/10'
          : 'hover:bg-white/5 text-foreground/50 hover:text-foreground/80',
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
