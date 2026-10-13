import {
  axiosResponse,
  installMockHttp,
  type MockHttpInstance,
} from '@services/__mocks__/http.mock';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { UserOnboardingService } from '@services/onboarding/user-onboarding.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('OnboardingService', () => {
  let service: OnboardingService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OnboardingService('onboarding-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = OnboardingService.getInstance('tok');
    expect(OnboardingService.getInstance('tok')).toBe(first);
  });

  it('getStatus GETs the status payload', async () => {
    const status = { hasCompletedOnboarding: false, isFirstLogin: true };
    http.get.mockResolvedValue(axiosResponse(status));

    const result = await service.getStatus();

    expect(http.get).toHaveBeenCalledWith('status');
    expect(result).toEqual(status);
  });

  it('getStatus rethrows failures', async () => {
    http.get.mockRejectedValue(new Error('down'));
    await expect(service.getStatus()).rejects.toThrow('down');
  });

  it('getInstallReadiness GETs the readiness payload', async () => {
    const readiness = { authMode: 'none', billingMode: 'oss_local' };
    http.get.mockResolvedValue(axiosResponse(readiness));

    const result = await service.getInstallReadiness();

    expect(http.get).toHaveBeenCalledWith('install-readiness');
    expect(result).toEqual(readiness);
  });

  it('getInstallReadiness rethrows failures', async () => {
    http.get.mockRejectedValue(new Error('down'));
    await expect(service.getInstallReadiness()).rejects.toThrow('down');
  });
});

describe('UserOnboardingService', () => {
  const userId = 'user_1';
  let service: UserOnboardingService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserOnboardingService('user-onboarding-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = UserOnboardingService.getInstance('tok');
    expect(UserOnboardingService.getInstance('tok')).toBe(first);
  });

  it('getOnboarding unwraps JSON:API attributes when present', async () => {
    http.get.mockResolvedValue(
      axiosResponse({
        data: { attributes: { isOnboardingCompleted: true } },
      }),
    );

    const result = await service.getOnboarding(userId);

    expect(http.get).toHaveBeenCalledWith(`${userId}/onboarding`);
    expect(result).toEqual({ isOnboardingCompleted: true });
  });

  it('getOnboarding falls back to the raw payload', async () => {
    http.get.mockResolvedValue(axiosResponse({ isOnboardingCompleted: false }));

    const result = await service.getOnboarding(userId);

    expect(result).toEqual({ isOnboardingCompleted: false });
  });

  it('getOnboarding rethrows failures', async () => {
    http.get.mockRejectedValue(new Error('down'));
    await expect(service.getOnboarding(userId)).rejects.toThrow('down');
  });

  it('updateOnboarding PATCHes the payload and unwraps attributes', async () => {
    http.patch.mockResolvedValue(
      axiosResponse({
        data: { attributes: { onboardingStepsCompleted: ['welcome'] } },
      }),
    );

    const result = await service.updateOnboarding(userId, {
      onboardingStepsCompleted: ['welcome'],
    });

    expect(http.patch).toHaveBeenCalledWith(`${userId}/onboarding`, {
      onboardingStepsCompleted: ['welcome'],
    });
    expect(result).toEqual({ onboardingStepsCompleted: ['welcome'] });
  });

  it('updateOnboarding rethrows failures', async () => {
    http.patch.mockRejectedValue(new Error('down'));
    await expect(
      service.updateOnboarding(userId, { isOnboardingCompleted: true }),
    ).rejects.toThrow('down');
  });
});
