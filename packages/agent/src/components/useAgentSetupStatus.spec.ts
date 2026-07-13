import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useBrandMock, computeBrandCompletenessMock } = vi.hoisted(() => ({
  computeBrandCompletenessMock: vi.fn(),
  useBrandMock: vi.fn(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@genfeedai/helpers', () => ({
  computeBrandCompleteness: (brand: unknown) =>
    computeBrandCompletenessMock(brand),
}));

import { useAgentSetupStatus } from '@genfeedai/agent/components/useAgentSetupStatus';

interface FakeCredential {
  externalAvatar?: string;
  externalHandle?: string;
  externalName?: string;
  id: string;
  isConnected: boolean;
  label?: string;
  platform: string;
}

function setBrandContext(
  selectedBrand: unknown,
  credentials: FakeCredential[] = [],
): void {
  useBrandMock.mockReturnValue({ credentials, selectedBrand });
}

describe('useAgentSetupStatus', () => {
  beforeEach(() => {
    useBrandMock.mockReset();
    computeBrandCompletenessMock.mockReset();
    computeBrandCompletenessMock.mockReturnValue({ overallScore: 0 });
  });

  it('offers the panel when there is no brand context but never scores', () => {
    setBrandContext(undefined);

    const { result } = renderHook(() => useAgentSetupStatus());

    expect(result.current.showSetupPanel).toBe(false);
    expect(result.current.completenessScore).toBeNull();
    expect(computeBrandCompletenessMock).not.toHaveBeenCalled();
  });

  it('shows the panel when brand context is incomplete', () => {
    computeBrandCompletenessMock.mockReturnValue({ overallScore: 40 });
    setBrandContext({ id: 'brand-1' });

    const { result } = renderHook(() => useAgentSetupStatus());

    expect(result.current.completenessScore).toBe(40);
    expect(result.current.isBrandComplete).toBe(false);
    expect(result.current.showSetupPanel).toBe(true);
  });

  it('still shows the panel when brand is complete but no channels are connected', () => {
    computeBrandCompletenessMock.mockReturnValue({ overallScore: 100 });
    setBrandContext({ id: 'brand-1' });

    const { result } = renderHook(() => useAgentSetupStatus());

    expect(result.current.isBrandComplete).toBe(true);
    expect(result.current.hasConnectedChannels).toBe(false);
    expect(result.current.isSetupComplete).toBe(false);
    expect(result.current.showSetupPanel).toBe(true);
  });

  it('hides the panel once brand is complete and a channel is connected', () => {
    computeBrandCompletenessMock.mockReturnValue({ overallScore: 100 });
    setBrandContext({ id: 'brand-1' }, [
      { id: 'cred-1', isConnected: true, platform: 'twitter' },
    ]);

    const { result } = renderHook(() => useAgentSetupStatus());

    expect(result.current.isSetupComplete).toBe(true);
    expect(result.current.showSetupPanel).toBe(false);
  });

  it('only counts connected credentials and projects the connection shape', () => {
    computeBrandCompletenessMock.mockReturnValue({ overallScore: 60 });
    setBrandContext({ id: 'brand-1' }, [
      {
        externalAvatar: 'https://cdn/avatar.png',
        externalHandle: 'creator',
        externalName: 'Creator',
        id: 'cred-1',
        isConnected: true,
        label: 'Main',
        platform: 'instagram',
      },
      { id: 'cred-2', isConnected: false, platform: 'tiktok' },
    ]);

    const { result } = renderHook(() => useAgentSetupStatus());

    expect(result.current.connectedPlatformsCount).toBe(1);
    expect(result.current.connectedConnections).toEqual([
      {
        avatarUrl: 'https://cdn/avatar.png',
        credentialId: 'cred-1',
        handle: 'creator',
        label: 'Main',
        name: 'Creator',
        platform: 'instagram',
      },
    ]);
  });
});
