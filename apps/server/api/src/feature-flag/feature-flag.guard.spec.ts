import { FeatureFlagGuard } from '@api/feature-flag/feature-flag.guard';
import { describe, expect, it, vi } from 'vitest';

function createContext(request: Record<string, unknown> = {}) {
  return {
    getClass: vi.fn().mockReturnValue(class TestController {}),
    getHandler: vi.fn().mockReturnValue(function testHandler() {}),
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue(request),
    }),
  };
}

describe('FeatureFlagGuard', () => {
  it('allows requests when no feature flag metadata is present', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    };
    const featureFlagService = {
      isEnabled: vi.fn(),
    };
    const guard = new FeatureFlagGuard(
      reflector as never,
      featureFlagService as never,
    );

    expect(guard.canActivate(createContext() as never)).toBe(true);
    expect(featureFlagService.isEnabled).not.toHaveBeenCalled();
  });

  it('allows requests when the feature flag is enabled', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('new-dashboard'),
    };
    const featureFlagService = {
      isEnabled: vi.fn().mockReturnValue(true),
    };
    const guard = new FeatureFlagGuard(
      reflector as never,
      featureFlagService as never,
    );
    const context = createContext({
      context: {
        organizationId: 'org-123',
        subscriptionTier: 'pro',
        userId: 'user-123',
      },
    });

    expect(guard.canActivate(context as never)).toBe(true);
    expect(featureFlagService.isEnabled).toHaveBeenCalledWith('new-dashboard', {
      id: 'user-123',
      organizationId: 'org-123',
      plan: 'pro',
    });
  });

  it('throws NotFoundException when the feature flag is disabled', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('new-dashboard'),
    };
    const featureFlagService = {
      isEnabled: vi.fn().mockReturnValue(false),
    };
    const guard = new FeatureFlagGuard(
      reflector as never,
      featureFlagService as never,
    );

    expect(() => guard.canActivate(createContext() as never)).toThrowError(
      'Not Found',
    );
  });

  it('falls back to alternate request user identifiers', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('new-dashboard'),
    };
    const featureFlagService = {
      isEnabled: vi.fn().mockReturnValue(true),
    };
    const guard = new FeatureFlagGuard(
      reflector as never,
      featureFlagService as never,
    );
    const context = createContext({
      auth: {
        publicMetadata: {
          user: 'auth-user',
        },
      },
    });

    guard.canActivate(context as never);

    expect(featureFlagService.isEnabled).toHaveBeenCalledWith('new-dashboard', {
      id: 'auth-user',
    });
  });
});
