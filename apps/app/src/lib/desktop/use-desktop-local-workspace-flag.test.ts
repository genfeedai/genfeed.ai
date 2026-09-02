import { DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopLocalWorkspaceFlag } from './use-desktop-local-workspace-flag';

const analyticsMocks = vi.hoisted(() => ({
  isAnalyticsEnabled: vi.fn(),
  subscribeAnalyticsFeatureFlags: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  isAnalyticsEnabled: analyticsMocks.isAnalyticsEnabled,
  subscribeAnalyticsFeatureFlags: analyticsMocks.subscribeAnalyticsFeatureFlags,
}));

describe('useDesktopLocalWorkspaceFlag', () => {
  beforeEach(() => {
    analyticsMocks.isAnalyticsEnabled.mockReset();
    analyticsMocks.subscribeAnalyticsFeatureFlags.mockReset();
  });

  it('enables the local-workspace slice when PostHog is not configured', () => {
    analyticsMocks.isAnalyticsEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useDesktopLocalWorkspaceFlag());

    expect(result.current).toEqual({ isEnabled: true, isReady: true });
    expect(
      analyticsMocks.subscribeAnalyticsFeatureFlags,
    ).not.toHaveBeenCalled();
  });

  it('fails closed on SaaS until PostHog returns an explicit true', () => {
    analyticsMocks.isAnalyticsEnabled.mockReturnValue(true);
    let listener: ((flags: Record<string, boolean>) => void) | undefined;
    analyticsMocks.subscribeAnalyticsFeatureFlags.mockImplementation(
      (_keys, nextListener) => {
        listener = nextListener;
        return () => undefined;
      },
    );

    const { result } = renderHook(() => useDesktopLocalWorkspaceFlag());

    expect(result.current).toEqual({ isEnabled: false, isReady: false });

    act(() => {
      listener?.({});
    });
    expect(result.current).toEqual({ isEnabled: false, isReady: true });

    act(() => {
      listener?.({ [DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG]: true });
    });
    expect(result.current).toEqual({ isEnabled: true, isReady: true });
  });
});
