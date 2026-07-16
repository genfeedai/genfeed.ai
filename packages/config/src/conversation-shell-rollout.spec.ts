import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_SHELL_DEPLOYMENT_ORDER,
  evaluateConversationShellRollout,
  isConversationShellEvaluation,
  parseConversationShellRolloutConfig,
  resolveConversationShellDeploymentMode,
} from './conversation-shell-rollout';

function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    configVersion: 'rollout-2026-07-15',
    isEnabled: true,
    enabledCohorts: ['internal', 'opt_in'],
    enabledDeploymentModes: [...CONVERSATION_SHELL_DEPLOYMENT_ORDER],
    organizations: {
      internal: ['org-internal'],
      opt_in: ['org-opt-in'],
    },
    rollbackRevision: 0,
    schemaVersion: 1,
    ...overrides,
  };
}

describe('conversation shell rollout configuration', () => {
  it.each([
    undefined,
    true,
    'on',
    [],
    { isEnabled: true },
  ])('fails closed for missing or malformed configuration %#', (value) => {
    const parsed = parseConversationShellRolloutConfig(value);
    const evaluation = evaluateConversationShellRollout(parsed, {
      client: 'web',
      deployment: 'cloud',
      organizationId: 'org-internal',
    });

    expect(evaluation).toMatchObject({
      isEnabled: false,
      reason: 'invalid_configuration',
    });
  });

  it('enables only explicitly targeted organizations outside SaaS', () => {
    const parsed = parseConversationShellRolloutConfig(validConfig());

    expect(
      evaluateConversationShellRollout(parsed, {
        client: 'web',
        deployment: 'self-hosted',
        organizationId: 'org-internal',
      }),
    ).toMatchObject({
      cohort: 'internal',
      deploymentMode: 'community',
      isEnabled: true,
      reason: 'enabled',
    });
    expect(
      evaluateConversationShellRollout(parsed, {
        client: 'web',
        deployment: 'self-hosted',
        organizationId: 'org-unlisted',
      }),
    ).toMatchObject({
      cohort: null,
      isEnabled: false,
      reason: 'organization_not_targeted',
    });
  });

  it('enables the agent-first shell for every SaaS organization', () => {
    const parsed = parseConversationShellRolloutConfig(validConfig());

    const evaluation = evaluateConversationShellRollout(
      parsed,
      {
        client: 'web',
        deployment: 'cloud',
        organizationId: 'org-not-in-a-rollout-cohort',
      },
      new Date('2026-07-16T00:00:00.000Z'),
    );

    expect(evaluation).toMatchObject({
      cohort: 'all',
      deploymentMode: 'saas',
      isEnabled: true,
      reason: 'enabled',
    });
    expect(isConversationShellEvaluation(evaluation)).toBe(true);
  });

  it('keeps the global SaaS rollout behind its deployment switch', () => {
    const parsed = parseConversationShellRolloutConfig(
      validConfig({
        enabledDeploymentModes: [
          'community',
          'desktop_self_hosted',
          'desktop_cloud',
        ],
      }),
    );

    expect(
      evaluateConversationShellRollout(parsed, {
        client: 'web',
        deployment: 'cloud',
        organizationId: 'org-not-in-a-rollout-cohort',
      }),
    ).toMatchObject({
      cohort: null,
      deploymentMode: 'saas',
      isEnabled: false,
      reason: 'deployment_not_enabled',
    });
  });

  it('rejects overlapping organization cohorts', () => {
    const parsed = parseConversationShellRolloutConfig(
      validConfig({
        organizations: {
          internal: ['org-shared'],
          opt_in: ['org-shared'],
        },
      }),
    );

    expect(parsed).toEqual({ config: null, error: 'invalid_configuration' });
  });

  it('rejects unknown fields instead of silently accepting misspelled controls', () => {
    expect(
      parseConversationShellRolloutConfig(
        validConfig({ enableSaasImmediately: true }),
      ),
    ).toEqual({ config: null, error: 'invalid_configuration' });
    expect(
      parseConversationShellRolloutConfig(
        validConfig({
          organizations: {
            internal: ['org-internal'],
            opt_in: ['org-opt-in'],
            production: ['org-production'],
          },
        }),
      ),
    ).toEqual({ config: null, error: 'invalid_configuration' });
  });

  it('requires deployment modes to be an ordered prefix with SaaS last', () => {
    const validPrefix = parseConversationShellRolloutConfig(
      validConfig({
        enabledDeploymentModes: ['community', 'desktop_self_hosted'],
      }),
    );
    const skippedMode = parseConversationShellRolloutConfig(
      validConfig({ enabledDeploymentModes: ['community', 'saas'] }),
    );
    const saasFirst = parseConversationShellRolloutConfig(
      validConfig({ enabledDeploymentModes: ['saas'] }),
    );

    expect(validPrefix.error).toBeNull();
    expect(skippedMode.error).toBe('invalid_configuration');
    expect(saasFirst.error).toBe('invalid_configuration');
  });

  it('turns every cohort off through the kill switch without changing schema', () => {
    const parsed = parseConversationShellRolloutConfig(
      validConfig({ isEnabled: false, rollbackRevision: 3 }),
    );
    const evaluation = evaluateConversationShellRollout(parsed, {
      client: 'desktop',
      deployment: 'self-hosted',
      organizationId: 'org-internal',
    });

    expect(evaluation).toMatchObject({
      configVersion: 'rollout-2026-07-15',
      isEnabled: false,
      reason: 'disabled',
      rollbackRevision: 3,
      schemaVersion: 1,
    });
  });

  it('maps deployment and client axes to the locked rollout order', () => {
    expect(resolveConversationShellDeploymentMode('self-hosted', 'web')).toBe(
      'community',
    );
    expect(
      resolveConversationShellDeploymentMode('self-hosted', 'desktop'),
    ).toBe('desktop_self_hosted');
    expect(resolveConversationShellDeploymentMode('cloud', 'desktop')).toBe(
      'desktop_cloud',
    );
    expect(resolveConversationShellDeploymentMode('cloud', 'web')).toBe('saas');
  });

  it('rejects contradictory or free-text evaluation responses at the client boundary', () => {
    const evaluation = evaluateConversationShellRollout(
      parseConversationShellRolloutConfig(validConfig()),
      {
        client: 'web',
        deployment: 'cloud',
        organizationId: 'org-internal',
      },
      new Date('2026-07-15T00:00:00.000Z'),
    );

    expect(isConversationShellEvaluation(evaluation)).toBe(true);
    expect(
      isConversationShellEvaluation({
        ...evaluation,
        deploymentMode: 'customer-private-message',
      }),
    ).toBe(false);
    expect(
      isConversationShellEvaluation({
        ...evaluation,
        isEnabled: false,
        reason: 'enabled',
      }),
    ).toBe(false);
  });
});
