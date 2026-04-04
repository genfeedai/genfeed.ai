import { useBrandCommands } from '@hooks/commands/use-brand-commands/use-brand-commands';
import type { Brand } from '@models/organization/brand.model';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRegisterCommands = vi.fn();
const mockUnregisterCommand = vi.fn();

vi.mock('@hooks/ui/use-command-palette/use-command-palette', () => ({
  useCommandPalette: vi.fn(() => ({
    registerCommands: mockRegisterCommands,
    unregisterCommand: mockUnregisterCommand,
  })),
}));

vi.mock('@services/core/brand-commands.service', () => ({
  BrandCommandsService: {
    generateBrandCommands: vi.fn(() => [
      { id: 'switch-brand-1', name: 'Switch to Brand 1' },
    ]),
  },
}));

describe('useBrandCommands', () => {
  const mockBrands = [{ id: 'brand-1', name: 'Test Brand' }] as Brand[];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers brand commands on mount', () => {
    renderHook(() =>
      useBrandCommands({
        brands: mockBrands,
        currentBrandId: 'brand-1',
        onBrandSwitch: vi.fn(),
      }),
    );

    expect(mockRegisterCommands).toHaveBeenCalled();
  });

  it('does not register commands when disabled', () => {
    renderHook(() =>
      useBrandCommands({
        brands: mockBrands,
        currentBrandId: 'brand-1',
        enabled: false,
        onBrandSwitch: vi.fn(),
      }),
    );

    expect(mockRegisterCommands).not.toHaveBeenCalled();
  });

  it('does not register commands when no brands', () => {
    renderHook(() =>
      useBrandCommands({
        brands: [],
        currentBrandId: 'brand-1',
        onBrandSwitch: vi.fn(),
      }),
    );

    expect(mockRegisterCommands).not.toHaveBeenCalled();
  });
});
