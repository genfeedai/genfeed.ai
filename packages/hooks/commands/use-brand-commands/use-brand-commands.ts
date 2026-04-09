/**
 * Use Brand Commands Hook
 * Dynamically registers brand switching commands in the command palette
 */

import type { Brand } from '@genfeedai/models/organization/brand.model';
import { BrandCommandsService } from '@genfeedai/services/core/brand-commands.service';
import { useCommandPalette } from '@hooks/ui/use-command-palette/use-command-palette';
import { useEffect } from 'react';

export interface UseBrandCommandsOptions {
  brands: Brand[];
  currentBrandId: string;
  onBrandSwitch: (brandId: string) => void | Promise<void>;
  enabled?: boolean;
}

/**
 * Hook to register brand switching commands in the command palette
 *
 * @example
 * ```tsx
 * const { brands, brandId } = useBrandContext();
 * const handleBrandSwitch = async (id: string) => {
 *   // Switch brand logic
 * };
 *
 * useBrandCommands({
 *   brands,
 *   currentBrandId: brandId,
 *   onBrandSwitch: handleBrandSwitch,
 * });
 * ```
 */
export function useBrandCommands({
  brands,
  currentBrandId,
  onBrandSwitch,
  enabled = true,
}: UseBrandCommandsOptions): void {
  const { registerCommands, unregisterCommand } = useCommandPalette();

  useEffect(() => {
    if (!enabled || !brands || brands.length === 0) {
      return;
    }

    // Generate commands for all brands
    const commands = BrandCommandsService.generateBrandCommands(
      brands,
      currentBrandId,
      onBrandSwitch,
    );

    // Register all commands
    registerCommands(commands);

    // Cleanup: unregister commands when brands change or component unmounts
    return () => {
      commands.forEach((cmd) => {
        unregisterCommand(cmd.id);
      });
    };
  }, [
    brands,
    currentBrandId,
    onBrandSwitch,
    enabled,
    registerCommands,
    unregisterCommand,
  ]);
}
