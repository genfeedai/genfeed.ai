import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseCurrentUser = vi.fn();
const mockUseAccessState = vi.fn();
const mockUseBrand = vi.fn();
const mockGetStatus = vi.fn();

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => mockUseAccessState(),
  }),
);

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ getStatus: mockGetStatus }),
}));

vi.mock('@genfeedai/services/content/expert-path.service', () => ({
  ExpertPathService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

import { useSetupCard } from './use-setup-card';

const NON_EXPERT_BRAND = {
  brandId: 'brand-1',
  isReady: true,
  selectedBrand: { id: 'brand-1', organization: { accountType: 'STARTUP' } },
};

const EXPERT_BRAND = {
  brandId: 'brand-1',
  isReady: true,
  selectedBrand: { id: 'brand-1', organization: { accountType: 'EXPERT' } },
};

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
    mockUseBrand.mockReturnValue(NON_EXPERT_BRAND);
    mockGetStatus.mockResolvedValue(null);
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

  it('does not add Expert Path steps for a non-expert organization', async () => {
    const { result } = renderHook(() => useSetupCard());

    await waitFor(() => {
      expect(mockGetStatus).not.toHaveBeenCalled();
    });
    expect(result.current.steps.map((step) => step.key)).not.toContain(
      'positioning',
    );
  });

  it('prepends the Expert Path steps for an EXPERT organization with onboarding hrefs', async () => {
    mockUseBrand.mockReturnValue(EXPERT_BRAND);
    mockGetStatus.mockResolvedValue({
      corpus: { isComplete: false, readySourceCount: 0, sourceCount: 0 },
      firstSystem: {
        readiness: {
          creditCost: 0,
          isReady: false,
          isUsingInterviewPlatforms: true,
          missing: [],
          platforms: [],
        },
        status: 'none',
      },
      isExpert: true,
      positioning: { answeredCount: 0, isComplete: false, totalCount: 7 },
      publishApproval: { isRequired: true },
      brandId: 'brand-1',
    });

    const { result } = renderHook(() => useSetupCard());

    await waitFor(() => {
      expect(mockGetStatus).toHaveBeenCalledWith(
        'brand-1',
        expect.any(AbortSignal),
      );
    });

    await waitFor(() => {
      expect(result.current.steps.slice(0, 3).map((step) => step.key)).toEqual([
        'positioning',
        'corpus',
        'first-system',
      ]);
    });

    expect(result.current.steps[0]).toMatchObject({
      href: '/onboarding/positioning',
      isCompleted: false,
      key: 'positioning',
    });
    expect(result.current.steps[1]).toMatchObject({
      href: '/onboarding/corpus',
      isCompleted: false,
      key: 'corpus',
    });
    expect(result.current.steps[2]).toMatchObject({
      href: '/onboarding/first-system',
      isCompleted: false,
      key: 'first-system',
    });
  });

  it('marks Expert Path steps complete from the fetched status', async () => {
    mockUseBrand.mockReturnValue(EXPERT_BRAND);
    mockGetStatus.mockResolvedValue({
      corpus: { isComplete: true, readySourceCount: 3, sourceCount: 3 },
      firstSystem: {
        readiness: {
          creditCost: 0,
          isReady: true,
          isUsingInterviewPlatforms: false,
          missing: [],
          platforms: ['x'],
        },
        status: 'generated',
      },
      isExpert: true,
      positioning: { answeredCount: 7, isComplete: true, totalCount: 7 },
      publishApproval: { isRequired: false },
      brandId: 'brand-1',
    });

    const { result } = renderHook(() => useSetupCard());

    await waitFor(() => {
      const positioning = result.current.steps.find(
        (step) => step.key === 'positioning',
      );
      expect(positioning?.isCompleted).toBe(true);
    });

    expect(
      result.current.steps.find((step) => step.key === 'corpus')?.isCompleted,
    ).toBe(true);
    expect(
      result.current.steps.find((step) => step.key === 'first-system')
        ?.isCompleted,
    ).toBe(true);
  });
});
