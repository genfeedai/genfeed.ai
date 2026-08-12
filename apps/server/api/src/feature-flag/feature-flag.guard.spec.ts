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
  it('allows requests when no feature flag metadata is present', async () => {
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

    await expect(guard.canActivate(createContext() as never)).resolves.toBe(
      true,
    );
    expect(featureFlagService.isEnabled).not.toHaveBeenCalled();
  });

  it('allows requests when the feature flag is enabled', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('new-dashboard'),
    };
    const featureFlagService = {
      isEnabled: vi.fn().mockResolvedValue(true),
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

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(featureFlagService.isEnabled).toHaveBeenCalledWith('new-dashboard', {
      id: 'user-123',
      organizationId: 'org-123',
      plan: 'pro',
    });
  });

  it('throws NotFoundException when the feature flag is disabled', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('new-dashboard'),
    };
    const featureFlagService = {
      isEnabled: vi.fn().mockResolvedValue(false),
    };
    const guard = new FeatureFlagGuard(
      reflector as never,
      featureFlagService as never,
    );

    // Canonical 404 shape (#1147): NotFoundException('Route') → "Route not found".
    await expect(guard.canActivate(createContext() as never)).rejects.toThrow(
      'Route not found',
    );
  });

  it('falls back to alternate request user identifiers', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('new-dashboard'),
    };
    const featureFlagService = {
      isEnabled: vi.fn().mockResolvedValue(true),
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

    await guard.canActivate(context as never);

    expect(featureFlagService.isEnabled).toHaveBeenCalledWith('new-dashboard', {
      id: 'auth-user',
    });
  });

  it('passes is_internal from the canonical users.id identify contract', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue('reply_bot'),
    };
    const featureFlagService = {
      isEnabled: vi.fn().mockResolvedValue(true),
    };
    const guard = new FeatureFlagGuard(
      reflector as never,
      featureFlagService as never,
    );
    const context = createContext({
      user: {
        emailAddresses: [{ emailAddress: 'vincent@genfeed.ai', id: 'email-1' }],
        id: 'user-123',
        primaryEmailAddressId: 'email-1',
      },
    });

    await guard.canActivate(context as never);

    expect(featureFlagService.isEnabled).toHaveBeenCalledWith('reply_bot', {
      id: 'user-123',
      is_internal: true,
    });
  });
});
