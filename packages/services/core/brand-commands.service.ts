/**
 * Brand Commands Service
 * Generates dynamic commands for brand switching in the command palette
 */

import type { IBrand } from '@genfeedai/interfaces';
import type { ICommand } from '@genfeedai/interfaces/ui/command-palette.interface';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import { HiOutlineUserCircle } from 'react-icons/hi2';

export class BrandCommandsService {
  /**
   * Generate brand switching commands from brand list
   */
  static generateBrandCommands(
    brands: Brand[],
    currentBrandId: string,
    onBrandSwitch: (brandId: string) => void | Promise<void>,
  ): ICommand[] {
    if (!brands || brands.length === 0) {
      return [];
    }

    return brands.map((brand: IBrand, index) => ({
      action: async () => {
        if (currentBrandId !== brand.id) {
          await onBrandSwitch(brand.id);
        }
      },
      category: 'actions' as const,
      condition: () => {
        // Show all brands, but highlight current one
        return true;
      },
      description:
        currentBrandId === brand.id ? 'Current brand' : 'Switch brand',
      icon: HiOutlineUserCircle,
      id: `switch-brand-${brand.id}`,
      keywords: ['switch', 'brand', brand.label.toLowerCase()],
      label: `Switch to ${brand.label}`,
      priority: currentBrandId === brand.id ? 10 : 7,
      // Add keyboard shortcut for first 9 brands
      shortcut: index < 9 ? ['⌘', 'Shift', (index + 1).toString()] : undefined,
    }));
  }

  /**
   * Generate a command prefix for brand-related commands
   */
  static getBrandCommandPrefix(): string {
    return 'switch-brand-';
  }

  /**
   * Check if a command ID is a brand command
   */
  static isBrandCommand(commandId: string): boolean {
    return commandId.startsWith(BrandCommandsService.getBrandCommandPrefix());
  }

  /**
   * Extract brand ID from command ID
   */
  static extractBrandId(commandId: string): string | null {
    if (!BrandCommandsService.isBrandCommand(commandId)) {
      return null;
    }
    return commandId.replace(BrandCommandsService.getBrandCommandPrefix(), '');
  }
}
