'use client';

import { useBrandCommands } from '@genfeedai/hooks/commands/use-brand-commands/use-brand-commands';
import { useBrandSwitchHandler } from '@genfeedai/hooks/commands/use-brand-switch-handler/use-brand-switch-handler';
import type { BrandCommandsProviderProps } from '@genfeedai/props/components/brand-commands-provider.props';

export function BrandCommandsProvider({
  brands,
  brandId,
  onBrandChange,
}: BrandCommandsProviderProps) {
  const handleBrandSwitch = useBrandSwitchHandler(brandId, onBrandChange);

  useBrandCommands({
    brands,
    currentBrandId: brandId,
    enabled: brands.length > 1,
    onBrandSwitch: handleBrandSwitch,
  });

  return null;
}
