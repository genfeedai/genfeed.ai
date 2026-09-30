import { SubscriptionAttributionService } from '@services/analytics/subscription-attribution.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai' },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('SubscriptionAttributionService', () => {
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    SubscriptionAttributionService.clearInstance(mockToken);
  });

  it('is a static factory class', () => {
    expect(typeof SubscriptionAttributionService.getInstance).toBe('function');
    expect(typeof SubscriptionAttributionService.clearInstance).toBe(
      'function',
    );
  });

  it('returns an instance via getInstance', () => {
    const instance = SubscriptionAttributionService.getInstance(mockToken);
    expect(instance).toBeDefined();
  });

  it('returns the same instance for the same token (singleton)', () => {
    const inst1 = SubscriptionAttributionService.getInstance(mockToken);
    const inst2 = SubscriptionAttributionService.getInstance(mockToken);
    expect(inst1).toBe(inst2);
  });

  it('instance has attribution tracking methods', () => {
    const instance = SubscriptionAttributionService.getInstance(mockToken);
    expect(typeof instance.trackSubscription).toBe('function');
    expect(typeof instance.getContentSubscriptionStats).toBe('function');
    expect(typeof instance.getTopContentBySubscriptions).toBe('function');
  });

  it('clearInstance removes the cached instance', () => {
    const inst1 = SubscriptionAttributionService.getInstance(mockToken);
    SubscriptionAttributionService.clearInstance(mockToken);
    const inst2 = SubscriptionAttributionService.getInstance(mockToken);
    expect(inst1).not.toBe(inst2);
  });
});
