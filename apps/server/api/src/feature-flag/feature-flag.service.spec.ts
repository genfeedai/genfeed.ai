import { FeatureFlagService } from '@api/feature-flag/feature-flag.service';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
});

function createConfigService(overrides: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string) => overrides[key] ?? ''),
  };
}

describe('FeatureFlagService', () => {
  it('returns true when no defaults are configured', () => {
    const service = new FeatureFlagService(
      createConfigService() as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    expect(service.isEnabled('new-dashboard')).toBe(true);
  });

  it('uses explicit local defaults', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({
          enabled_feature: true,
          theme_variant: 'control',
        }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(service.isEnabled('enabled_feature')).toBe(true);
    expect(service.getFeatureValue('theme_variant', 'fallback')).toBe(
      'control',
    );
  });

  it('returns the default value when a flag key is missing', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ other: true }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(service.getFeatureValue('theme-variant', 'control')).toBe('control');
  });

  it('returns false for missing flags when defaults are configured', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ other: true }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(service.isEnabled('new-dashboard')).toBe(false);
  });

  it('fails closed when FEATURE_FLAG_DEFAULTS is invalid JSON', async () => {
    const loggerService = {
      debug: vi.fn(),
      warn: vi.fn(),
    };

    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: 'not-json',
      }) as never,
      loggerService as never,
    );

    await service.init();

    expect(loggerService.warn).toHaveBeenCalledWith(
      'Failed to parse FEATURE_FLAG_DEFAULTS; feature flags will fail closed',
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
    expect(service.isEnabled('new-dashboard')).toBe(false);
  });

  it('accepts optional attributes parameter without error', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({ dashboard: true }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(service.isEnabled('dashboard', { id: 'user-123' })).toBe(true);
  });

  it('fails the conversation shell closed when its rollout document is missing', async () => {
    const service = new FeatureFlagService(
      createConfigService() as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(
      service.evaluateConversationShell({
        client: 'web',
        organizationId: 'org-123',
      }),
    ).toMatchObject({
      isEnabled: false,
      reason: 'invalid_configuration',
    });
  });

  it('reports malformed structured rollout configuration without logging its contents', async () => {
    const loggerService = { debug: vi.fn(), warn: vi.fn() };
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({
          conversation_shell: {
            isEnabled: true,
            organizationId: 'secret-org',
          },
        }),
      }) as never,
      loggerService as never,
    );

    await service.init();

    expect(loggerService.warn).toHaveBeenCalledWith(
      'Conversation shell rollout configuration is invalid; evaluation will fail closed',
      { reason: 'invalid_configuration' },
    );
    expect(JSON.stringify(loggerService.warn.mock.calls)).not.toContain(
      'secret-org',
    );
  });

  it('targets an explicit organization cohort and rejects client disagreement', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({
          conversation_shell: {
            configVersion: 'test-v1',
            isEnabled: true,
            enabledCohorts: ['internal'],
            enabledDeploymentModes: ['community'],
            organizations: {
              internal: ['org-123'],
              opt_in: [],
            },
            rollbackRevision: 0,
            schemaVersion: 1,
          },
        }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(
      service.evaluateConversationShell({
        client: 'web',
        organizationId: 'org-123',
      }),
    ).toMatchObject({
      cohort: 'internal',
      deploymentMode: 'community',
      isEnabled: true,
      reason: 'enabled',
    });
    expect(
      service.evaluateConversationShell({
        client: 'browser-spoof',
        organizationId: 'org-123',
      }),
    ).toMatchObject({
      isEnabled: false,
      reason: 'missing_attributes',
    });
  });

  it('enables the agent-first shell for every SaaS organization', async () => {
    vi.stubEnv('GENFEED_CLOUD', 'true');
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({
          conversation_shell: {
            configVersion: 'test-global-saas',
            isEnabled: true,
            enabledCohorts: ['internal'],
            enabledDeploymentModes: [
              'community',
              'desktop_self_hosted',
              'desktop_cloud',
              'saas',
            ],
            organizations: {
              internal: ['org-internal'],
              opt_in: [],
            },
            rollbackRevision: 0,
            schemaVersion: 1,
          },
        }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(
      service.evaluateConversationShell({
        client: 'web',
        organizationId: 'org-created-after-rollout',
      }),
    ).toMatchObject({
      cohort: 'all',
      deploymentMode: 'saas',
      isEnabled: true,
      reason: 'enabled',
    });
  });

  it('disables the conversation shell through a rollback revision', async () => {
    const service = new FeatureFlagService(
      createConfigService({
        FEATURE_FLAG_DEFAULTS: JSON.stringify({
          conversation_shell: {
            configVersion: 'test-v2',
            isEnabled: false,
            enabledCohorts: ['internal'],
            enabledDeploymentModes: ['community'],
            organizations: { internal: ['org-123'], opt_in: [] },
            rollbackRevision: 4,
            schemaVersion: 1,
          },
        }),
      }) as never,
      { debug: vi.fn(), warn: vi.fn() } as never,
    );

    await service.init();

    expect(
      service.evaluateConversationShell({
        client: 'web',
        organizationId: 'org-123',
      }),
    ).toMatchObject({
      isEnabled: false,
      reason: 'disabled',
      rollbackRevision: 4,
    });
  });
});
