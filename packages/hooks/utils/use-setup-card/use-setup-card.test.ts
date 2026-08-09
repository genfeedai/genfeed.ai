import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseCurrentUser = vi.fn();
const mockUseAccessState = vi.fn();

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => mockUseAccessState(),
  }),
);

import { useSetupCard } from './use-setup-card';

function setUser(onboardingStepsCompleted: string[] | undefined): void {
  mockUseCurrentUser.mockReturnValue({
    currentUser: onboardingStepsCompleted
      ? { id: 'user-1', onboardingStepsCompleted }
      : null,
  });
}

describe('useSetupCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAccessState.mockReturnValue({ hasPaygCredits: false });
    setUser([]);
  });

  it('is visible with no completed steps', () => {
    const { result } = renderHook(() => useSetupCard());

    expect(result.current.isVisible).toBe(true);
    expect(result.current.completedCount).toBe(0);
    expect(result.current.totalCount).toBe(result.current.steps.length);
    expect(result.current.steps.length).toBeGreaterThan(0);
  });

  it('maps step hrefs, marking completion per step', () => {
    setUser(['preferences']);

    const { result } = renderHook(() => useSetupCard());

    const preferences = result.current.steps.find(
      (step) => step.key === 'preferences',
    );
    const platforms = result.current.steps.find(
      (step) => step.key === 'platforms',
    );

    expect(preferences?.isCompleted).toBe(true);
    expect(preferences?.href).toBe('/settings/brands');
    expect(platforms?.isCompleted).toBe(false);
    expect(platforms?.href).toBe('/settings/api-keys');
    expect(result.current.completedCount).toBe(1);
  });

  it('hides when every step is completed', () => {
    setUser(['preferences', 'platforms']);

    const { result } = renderHook(() => useSetupCard());

    expect(result.current.isVisible).toBe(false);
    expect(result.current.completedCount).toBe(result.current.totalCount);
  });

  it('hides for users with PAYG credits', () => {
    mockUseAccessState.mockReturnValue({ hasPaygCredits: true });

    const { result } = renderHook(() => useSetupCard());

    expect(result.current.isVisible).toBe(false);
  });

  it('treats a missing user as having no completed steps', () => {
    setUser(undefined);

    const { result } = renderHook(() => useSetupCard());

    expect(result.current.completedCount).toBe(0);
    expect(result.current.isVisible).toBe(true);
  });
});
