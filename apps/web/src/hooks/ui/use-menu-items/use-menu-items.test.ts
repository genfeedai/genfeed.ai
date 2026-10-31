import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockCredential {
  externalHandle?: string;
  externalName?: string;
  id: string;
  isConnected: boolean;
  label?: string;
  platform: string;
}

const mockUseBrand = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@helpers/ui/platform-icon/platform-icon.helper', () => ({
  getPlatformIconComponent: vi.fn((platform: string) => `icon-${platform}`),
}));

import { useMenuItems } from './use-menu-items';

const STATIC_ITEMS: MenuItemConfig[] = [
  { group: 'Posts', href: '/posts', label: 'All posts' },
  { group: 'Other', href: '/settings', label: 'Settings' },
] as MenuItemConfig[];

function setBrand(credentials: MockCredential[] | undefined): void {
  mockUseBrand.mockReturnValue({ credentials });
}

describe('useMenuItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBrand(undefined);
  });

  it('returns static items without credentials', () => {
    const { result } = renderHook(() => useMenuItems({ items: STATIC_ITEMS }));

    expect(result.current.map((item) => item.label)).toEqual([
      'All posts',
      'Settings',
    ]);
  });

  it('returns static items when there are no connected credentials', () => {
    setBrand([{ id: 'cred-1', isConnected: false, platform: 'instagram' }]);

    const { result } = renderHook(() => useMenuItems({ items: STATIC_ITEMS }));

    expect(result.current.map((item) => item.label)).toEqual([
      'All posts',
      'Settings',
    ]);
  });

  it('inserts connected credentials after the configured label', () => {
    setBrand([
      {
        externalHandle: '@acme',
        id: 'cred-1',
        isConnected: true,
        platform: 'instagram',
      },
    ]);

    const { result } = renderHook(() =>
      useMenuItems({ insertAfterLabel: 'All posts', items: STATIC_ITEMS }),
    );

    expect(result.current.map((item) => item.label)).toEqual([
      'All posts',
      '@acme',
      'Settings',
    ]);
    const dynamic = result.current[1];
    expect(dynamic.credentialId).toBe('cred-1');
    expect(dynamic.href).toBe('/publishing?platform=instagram');
    expect(dynamic.isDynamic).toBe(true);
  });

  it('falls back to externalName when there is no handle or label', () => {
    setBrand([
      {
        externalName: 'Genfeed Studio',
        id: 'cred-1',
        isConnected: true,
        platform: 'instagram',
      },
    ]);

    const { result } = renderHook(() =>
      useMenuItems({ insertAfterLabel: 'All posts', items: STATIC_ITEMS }),
    );

    expect(result.current.map((item) => item.label)).toEqual([
      'All posts',
      'Genfeed Studio',
      'Settings',
    ]);
  });

  it('falls back to appending after the last Posts item', () => {
    setBrand([
      { id: 'cred-1', isConnected: true, label: 'IG', platform: 'instagram' },
    ]);

    const { result } = renderHook(() =>
      useMenuItems({ insertAfterLabel: 'Unknown', items: STATIC_ITEMS }),
    );

    expect(result.current.map((item) => item.label)).toEqual([
      'All posts',
      'IG',
      'Settings',
    ]);
  });

  it('labels dynamic items by handle, label, then platform', () => {
    setBrand([{ id: 'cred-1', isConnected: true, platform: 'tiktok' }]);

    const { result } = renderHook(() =>
      useMenuItems({ insertAfterLabel: 'All posts', items: STATIC_ITEMS }),
    );

    expect(result.current[1].label).toBe('tiktok');
  });
});
