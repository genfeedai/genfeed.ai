import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindAll = vi.fn();
const mockEnroll = vi.fn();
const mockCompleteItem = vi.fn();
const mockReopenItem = vi.fn();
const mockGetService = vi.fn();
const mockUseBrand = vi.fn();
const mockUseAuthIdentity = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mockUseAuthIdentity(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetService,
}));

vi.mock('@genfeedai/services/social/social-warmup-enrollments.service', () => ({
  SocialWarmupEnrollmentsService: { getInstance: vi.fn() },
}));

import { useSocialWarmupEnrollment } from './use-social-warmup-enrollment';

const ENROLLMENT = { credentialId: 'credential-1', id: 'enrollment-1' };
const UPDATED = {
  credentialId: 'credential-1',
  id: 'enrollment-1',
  state: 'IN_PROGRESS',
};

describe('useSocialWarmupEnrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAll.mockResolvedValue([ENROLLMENT]);
    mockEnroll.mockResolvedValue(ENROLLMENT);
    mockCompleteItem.mockResolvedValue(UPDATED);
    mockReopenItem.mockResolvedValue(UPDATED);
    mockGetService.mockResolvedValue({
      completeItem: mockCompleteItem,
      enroll: mockEnroll,
      findAll: mockFindAll,
      reopenItem: mockReopenItem,
    });
    mockUseBrand.mockReturnValue({ brandId: 'brand-1' });
    mockUseAuthIdentity.mockReturnValue({ isSignedIn: true });
  });

  it('loads the enrollment for the selected credential', async () => {
    const { result } = renderHook(
      () => useSocialWarmupEnrollment({ credentialId: 'credential-1' }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFindAll).toHaveBeenCalledWith({
      brand: 'brand-1',
      credential: 'credential-1',
    });
    expect(result.current.data).toEqual(ENROLLMENT);
  });

  it('does not fetch without a credential', () => {
    renderHook(() => useSocialWarmupEnrollment(), {
      wrapper: createQueryWrapper(),
    });

    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('invalidates the enrollment query after enroll, complete, and reopen', async () => {
    const { result } = renderHook(
      () => useSocialWarmupEnrollment({ credentialId: 'credential-1' }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(ENROLLMENT);
    });

    mockFindAll.mockClear();
    mockFindAll.mockResolvedValue([UPDATED]);

    await act(async () => {
      await result.current.enroll('credential-1');
    });
    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalled();
    });

    mockFindAll.mockClear();
    await act(async () => {
      await result.current.completeItem('use-native-app-manually');
    });
    expect(mockCompleteItem).toHaveBeenCalledWith(
      'enrollment-1',
      'use-native-app-manually',
    );
    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalled();
    });

    mockFindAll.mockClear();
    await act(async () => {
      await result.current.reopenItem('use-native-app-manually');
    });
    expect(mockReopenItem).toHaveBeenCalledWith(
      'enrollment-1',
      'use-native-app-manually',
    );
    await waitFor(() => {
      expect(mockFindAll).toHaveBeenCalled();
    });
  });
});
