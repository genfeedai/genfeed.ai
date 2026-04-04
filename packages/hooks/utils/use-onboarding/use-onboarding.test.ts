import { useOnboarding } from '@hooks/utils/use-onboarding/use-onboarding';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetOnboardingService = vi.fn();
const mockGetStatus = vi.fn();

vi.mock('@genfeedai/enums', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    ModalEnum: {
      ONBOARDING: 'onboarding',
    },
  };
});

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mockGetOnboardingService),
}));

vi.mock('@services/onboarding/onboarding.service', () => ({
  OnboardingService: {
    getInstance: vi.fn(),
  },
}));

describe('useOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStatus.mockResolvedValue({
      hasCompletedOnboarding: true,
      isFirstLogin: false,
    });
    mockGetOnboardingService.mockResolvedValue({ getStatus: mockGetStatus });
  });

  it('returns required fields', async () => {
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isFirstLogin');
    expect(result.current).toHaveProperty('hasCompletedOnboarding');
    expect(result.current).toHaveProperty('openOnboarding');
    expect(result.current).toHaveProperty('checkOnboardingStatus');
  });

  it('starts with isLoading true', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.isLoading).toBe(true);
  });

  it('sets hasCompletedOnboarding from service response', async () => {
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
    expect(result.current.isFirstLogin).toBe(false);
  });

  it('openOnboarding calls openModal', async () => {
    const { openModal } = await import('@helpers/ui/modal/modal.helper');
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.openOnboarding();
    });
    expect(openModal).toHaveBeenCalledWith('onboarding');
  });

  it('handles service error gracefully', async () => {
    mockGetOnboardingService.mockResolvedValue({
      getStatus: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // On error, assume completed
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });
});
