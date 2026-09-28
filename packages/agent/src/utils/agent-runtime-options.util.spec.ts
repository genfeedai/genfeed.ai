import type { AgentInstallReadiness } from '@genfeedai/agent/services/agent-api.types';
import { describe, expect, it } from 'vitest';
import {
  buildAgentRuntimeCatalog,
  resolveDesktopCliRuntimeBlocker,
  resolveDesktopCliRuntimeKey,
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

const DESKTOP_TOOLS = {
  anyDetected: true,
  claude: true,
  codex: true,
  detected: ['claude', 'codex', 'grok'],
  grok: true,
};

describe('buildAgentRuntimeCatalog', () => {
  it('returns hosted options and empty summaries in a browser', () => {
    const catalog = buildAgentRuntimeCatalog({});

    expect(catalog.environmentLabel).toBe('cloud');
    expect(catalog.options.map((option) => option.key)).toEqual([
      '',
      'hosted/genfeed',
      'hosted/openrouter',
      'hosted/replicate',
    ]);
    expect(catalog.localToolSummary).toBe(
      'No Claude Code or Codex CLI found on this computer',
    );
    expect(catalog.providerSummary).toBe('No provider keys configured');
  });

  it('ignores server-side CLI detection that cannot execute in a browser', () => {
    const catalog = buildAgentRuntimeCatalog({
      readiness: readiness({
        localTools: {
          anyDetected: true,
          claude: true,
          codex: true,
          detected: ['claude', 'codex'],
        },
      }),
    });

    expect(catalog.options.some((option) => option.category === 'local')).toBe(
      false,
    );
  });

  it('offers desktop-detected CLIs after Auto with a subscription hint', () => {
    const catalog = buildAgentRuntimeCatalog({
      desktopTools: DESKTOP_TOOLS,
      readiness: readiness({
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
      'local/claude-cli',
      'local/codex-cli',
      'hosted/genfeed',
      'hosted/openrouter',
      'hosted/replicate',
    ]);
    expect(catalog.options[1]?.hint).toBe(
      'Runs on your Claude Code subscription — no Genfeed credits',
    );
    expect(catalog.options[1]?.requestedModel).toBe('');
    expect(catalog.localToolSummary).toBe('Local CLIs: claude, codex');
    expect(catalog.providerSummary).toBe('Providers ready: openai');
  });

  it('keeps an outdated Codex CLI out of the picker with its upgrade step', () => {
    const upgradeMessage =
      'This Codex CLI is too old to run Genfeed agent turns. Update it with `npm install -g @openai/codex@latest`, then restart Genfeed Desktop.';
    const catalog = buildAgentRuntimeCatalog({
      desktopTools: {
        anyDetected: false,
        claude: false,
        codex: false,
        detected: [],
        grok: false,
        upgradesRequired: [{ key: 'codex', message: upgradeMessage }],
      },
    });

    expect(
      catalog.options.some((option) => option.key === 'local/codex-cli'),
    ).toBe(false);
    expect(catalog.localToolNotice).toBe(upgradeMessage);
    expect(buildAgentRuntimeCatalog({}).localToolNotice).toBeNull();
    expect(
      buildAgentRuntimeCatalog({ desktopTools: DESKTOP_TOOLS }).localToolNotice,
    ).toBeNull();
  });

  it('only offers the CLIs that are installed', () => {
    const catalog = buildAgentRuntimeCatalog({
      desktopTools: { ...DESKTOP_TOOLS, claude: false, detected: ['codex'] },
    });

    expect(
      catalog.options
        .filter((option) => option.category === 'local')
        .map((option) => option.key),
    ).toEqual(['local/codex-cli']);
  });
});

describe('resolveDesktopCliRuntimeKey', () => {
  it('routes the active thread to its local CLI runtime in Desktop', () => {
    expect(
      resolveDesktopCliRuntimeKey({
        activeThreadId: 'thread-1',
        hasDesktopBridge: true,
        thread: { runtimeKey: 'local/claude-cli' },
      }),
    ).toBe('local/claude-cli');
  });

  it('uses the draft runtime for a new thread', () => {
    expect(
      resolveDesktopCliRuntimeKey({
        activeThreadId: null,
        draftRuntimeKey: 'local/codex-cli',
        hasDesktopBridge: true,
        thread: null,
      }),
    ).toBe('local/codex-cli');
  });

  it('keeps hosted threads and browsers on the API transport', () => {
    expect(
      resolveDesktopCliRuntimeKey({
        activeThreadId: 'thread-1',
        hasDesktopBridge: true,
        thread: { runtimeKey: 'hosted/genfeed' },
      }),
    ).toBeNull();
    expect(
      resolveDesktopCliRuntimeKey({
        activeThreadId: 'thread-1',
        hasDesktopBridge: false,
        thread: { runtimeKey: 'local/claude-cli' },
      }),
    ).toBeNull();
    expect(
      resolveDesktopCliRuntimeKey({
        activeThreadId: 'thread-1',
        draftRuntimeKey: 'local/claude-cli',
        hasDesktopBridge: true,
        thread: null,
      }),
    ).toBeNull();
  });
});

describe('resolveDesktopCliRuntimeBlocker', () => {
  const upgradeMessage =
    'This Codex CLI is too old to run Genfeed agent turns. Update it with `npm install -g @openai/codex@latest`, then restart Genfeed Desktop.';

  it('lets a ready CLI run', () => {
    expect(
      resolveDesktopCliRuntimeBlocker('local/codex-cli', DESKTOP_TOOLS),
    ).toBeNull();
  });

  it('explains an outdated Codex CLI with its upgrade step', () => {
    const blocker = resolveDesktopCliRuntimeBlocker('local/codex-cli', {
      ...DESKTOP_TOOLS,
      codex: false,
      detected: ['claude'],
      upgradesRequired: [{ key: 'codex', message: upgradeMessage }],
    });

    expect(blocker).toContain(upgradeMessage);
    expect(blocker).toContain('pick a Genfeed runtime');
  });

  it('explains a missing CLI, including when detection failed', () => {
    expect(
      resolveDesktopCliRuntimeBlocker('local/claude-cli', {
        ...DESKTOP_TOOLS,
        claude: false,
      }),
    ).toContain('Claude Code was not found on this computer');
    expect(resolveDesktopCliRuntimeBlocker('local/claude-cli', null)).toContain(
      'Claude Code was not found on this computer',
    );
  });
});

describe('resolveThreadRuntimeOption', () => {
  const catalog = buildAgentRuntimeCatalog({ desktopTools: DESKTOP_TOOLS });

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

  it('keeps showing a local CLI the thread is bound to when it is not offered', () => {
    const hostedOnly = buildAgentRuntimeCatalog({});

    expect(
      resolveThreadRuntimeOption({
        catalog: hostedOnly,
        thread: { runtimeKey: 'local/codex-cli' },
      }),
    ).toMatchObject({ key: 'local/codex-cli', label: 'Codex' });
  });
});
