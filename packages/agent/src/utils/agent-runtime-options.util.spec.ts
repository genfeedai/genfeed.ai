import type { AgentInstallReadiness } from '@genfeedai/agent/services/agent-api.types';
import { describe, expect, it } from 'vitest';
import {
  buildAgentRuntimeCatalog,
  isLocalTerminalHost,
  resolveThreadRuntimeOption,
} from './agent-runtime-options.util';

function readiness(
  overrides: Partial<AgentInstallReadiness> = {},
): AgentInstallReadiness {
  return {
    authMode: 'none',
    billingMode: 'oss_local',
    localTools: {
      anyDetected: false,
      claude: false,
      codex: false,
      detected: [],
    },
    providers: {
      anyConfigured: false,
      configured: [],
      fal: false,
      imageGenerationReady: false,
      openai: false,
      replicate: false,
      textGenerationReady: false,
    },
    ui: {
      showBilling: false,
      showCloudUpgradeCta: false,
      showCredits: false,
      showPricing: false,
    },
    workspace: {
      brandId: null,
      hasBrand: false,
      hasOrganization: false,
      organizationId: null,
    },
    ...overrides,
  };
}

describe('isLocalTerminalHost', () => {
  it('accepts only loopback hostnames', () => {
    expect(isLocalTerminalHost('localhost')).toBe(true);
    expect(isLocalTerminalHost('127.0.0.1')).toBe(true);
    expect(isLocalTerminalHost('::1')).toBe(true);
    expect(isLocalTerminalHost('app.genfeed.ai')).toBe(false);
    expect(isLocalTerminalHost(null)).toBe(false);
    expect(isLocalTerminalHost(undefined)).toBe(false);
  });
});

describe('buildAgentRuntimeCatalog', () => {
  it('returns hosted options and empty summaries in the cloud', () => {
    const catalog = buildAgentRuntimeCatalog({
      hostname: 'app.genfeed.ai',
    });

    expect(catalog.environmentLabel).toBe('cloud');
    expect(catalog.options.map((option) => option.key)).toEqual([
      '',
      'hosted/genfeed',
      'hosted/openrouter',
      'hosted/replicate',
    ]);
    expect(catalog.localToolSummary).toBe('No local CLIs detected');
    expect(catalog.providerSummary).toBe('No provider keys configured');
  });

  it('inserts detected local CLIs after Auto on a local host', () => {
    const catalog = buildAgentRuntimeCatalog({
      hostname: 'localhost',
      readiness: readiness({
        localTools: {
          anyDetected: true,
          claude: true,
          codex: true,
          detected: ['claude', 'codex'],
        },
        providers: {
          anyConfigured: true,
          configured: ['openai'],
          fal: false,
          imageGenerationReady: false,
          openai: true,
          replicate: false,
          textGenerationReady: true,
        },
      }),
    });

    expect(catalog.environmentLabel).toBe('local');
    expect(catalog.options.map((option) => option.key)).toEqual([
      '',
      'local/codex-cli',
      'local/claude-cli',
      'hosted/genfeed',
      'hosted/openrouter',
      'hosted/replicate',
    ]);
    expect(catalog.localToolSummary).toBe('Local CLIs: claude, codex');
    expect(catalog.providerSummary).toBe('Providers ready: openai');
  });
});

describe('resolveThreadRuntimeOption', () => {
  const catalog = buildAgentRuntimeCatalog({ hostname: 'localhost' });

  it('prefers runtimeKey, then requestedModel, then Auto', () => {
    expect(
      resolveThreadRuntimeOption({
        catalog,
        thread: { requestedModel: 'ignored', runtimeKey: 'hosted/openrouter' },
      }).key,
    ).toBe('hosted/openrouter');

    expect(
      resolveThreadRuntimeOption({
        catalog,
        thread: {
          requestedModel: 'meta/meta-llama-3.1-405b-instruct',
          runtimeKey: 'missing',
        },
      }).key,
    ).toBe('hosted/replicate');

    expect(
      resolveThreadRuntimeOption({
        catalog,
        thread: { requestedModel: '', runtimeKey: '' },
      }).key,
    ).toBe('');
  });
});
