import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type {
  AgentRuntimeCatalog,
  AgentRuntimeOption,
} from '@genfeedai/agent/models/agent-runtime.model';
import type { AgentInstallReadiness } from '@genfeedai/agent/services/agent-api.service';
import {
  AGENT_EXTERNAL_RUNTIME_KEYS,
  type AgentExternalRuntimeKey,
  isAgentExternalRuntimeKey,
} from '@genfeedai/contracts/constants';
import type { IDesktopLocalToolReadiness } from '@genfeedai/contracts/desktop';

const HOSTED_RUNTIME_OPTIONS: AgentRuntimeOption[] = [
  {
    category: 'auto',
    description: 'Use the conversation default routing path',
    key: '',
    label: 'Auto',
    provider: 'genfeed',
    requestedModel: '',
  },
  {
    category: 'hosted',
    description: 'Genfeed hosted runtime',
    key: 'hosted/genfeed',
    label: 'Genfeed',
    provider: 'genfeed',
    requestedModel: '',
  },
  {
    // Same model as the Genfeed runtime on purpose — these two options differ
    // by provider, not by model, and `openrouter/auto` is retired. `key` is the
    // discriminator; `requestedModel` is only a fallback for legacy threads
    // stored before runtimeKey existed, which belong on the platform default.
    category: 'hosted',
    description: 'OpenRouter-routed inference',
    key: 'hosted/openrouter',
    label: 'OpenRouter',
    provider: 'openrouter',
    requestedModel: '',
  },
  {
    category: 'hosted',
    description: 'Replicate open-source models',
    key: 'hosted/replicate',
    label: 'Replicate',
    provider: 'replicate',
    requestedModel: 'meta/meta-llama-3.1-405b-instruct',
  },
];

/**
 * Local CLI runtimes execute in Genfeed Desktop on the user's own Claude Code
 * / Codex subscription. Threads, brand context, and memory stay in Genfeed;
 * the model turn costs no Genfeed credits. `requestedModel` stays empty: the
 * CLI picks its own model.
 */
export const DESKTOP_CLAUDE_CLI_RUNTIME_OPTION: AgentRuntimeOption = {
  category: 'local',
  description: 'Claude Code on this computer',
  hint: 'Runs on your Claude Code subscription — no Genfeed credits',
  key: AGENT_EXTERNAL_RUNTIME_KEYS.CLAUDE_CLI,
  label: 'Claude Code',
  provider: 'claude',
  requestedModel: '',
};

export const DESKTOP_CODEX_CLI_RUNTIME_OPTION: AgentRuntimeOption = {
  category: 'local',
  description: 'Codex CLI on this computer',
  hint: 'Runs on your Codex (ChatGPT) subscription — no Genfeed credits',
  key: AGENT_EXTERNAL_RUNTIME_KEYS.CODEX_CLI,
  label: 'Codex',
  provider: 'codex',
  requestedModel: '',
};

function getLocalToolSummary(
  desktopTools?: IDesktopLocalToolReadiness | null,
): string {
  const detected = (desktopTools?.detected ?? []).filter(
    (tool) => tool === 'claude' || tool === 'codex',
  );
  if (detected.length === 0) {
    return 'No Claude Code or Codex CLI found on this computer';
  }

  return `Local CLIs: ${detected.join(', ')}`;
}

function getProviderSummary(readiness?: AgentInstallReadiness | null): string {
  const configured = readiness?.providers.configured ?? [];
  if (configured.length === 0) {
    return 'No provider keys configured';
  }

  return `Providers ready: ${configured.join(', ')}`;
}

export function isDesktopCliRuntimeKey(
  key?: string | null,
): key is AgentExternalRuntimeKey {
  return isAgentExternalRuntimeKey(key);
}

/** True when this desktop has the CLI binary a local runtime needs. */
export function isDesktopCliRuntimeAvailable(
  key: AgentExternalRuntimeKey,
  desktopTools?: IDesktopLocalToolReadiness | null,
): boolean {
  return key === AGENT_EXTERNAL_RUNTIME_KEYS.CLAUDE_CLI
    ? desktopTools?.claude === true
    : desktopTools?.codex === true;
}

/**
 * Local CLI runtimes are offered only where they can execute: inside Genfeed
 * Desktop, when the desktop bridge reports the binary installed. A browser
 * (even on a self-hosted localhost) has no way to run them.
 */
export function buildAgentRuntimeCatalog(params: {
  desktopTools?: IDesktopLocalToolReadiness | null;
  readiness?: AgentInstallReadiness | null;
}): AgentRuntimeCatalog {
  const localOptions = [
    DESKTOP_CLAUDE_CLI_RUNTIME_OPTION,
    DESKTOP_CODEX_CLI_RUNTIME_OPTION,
  ].filter((option) =>
    isDesktopCliRuntimeAvailable(
      option.key as AgentExternalRuntimeKey,
      params.desktopTools,
    ),
  );
  const [autoOption, ...hostedOptions] = HOSTED_RUNTIME_OPTIONS;

  return {
    environmentLabel: localOptions.length > 0 ? 'local' : 'cloud',
    localToolSummary: getLocalToolSummary(params.desktopTools),
    options: [autoOption, ...localOptions, ...hostedOptions],
    providerSummary: getProviderSummary(params.readiness),
  };
}

/**
 * The CLI runtime a send should use, or null for the hosted API path. Uses
 * the active thread's runtime, or the draft runtime for a new thread.
 */
export function resolveDesktopCliRuntimeKey(params: {
  activeThreadId: string | null;
  desktopTools?: IDesktopLocalToolReadiness | null;
  draftRuntimeKey?: string | null;
  hasDesktopBridge: boolean;
  thread?: Pick<AgentThread, 'runtimeKey'> | null;
}): AgentExternalRuntimeKey | null {
  if (!params.hasDesktopBridge) {
    return null;
  }

  const key = params.activeThreadId
    ? params.thread?.runtimeKey
    : params.draftRuntimeKey;

  return isDesktopCliRuntimeKey(key) &&
    isDesktopCliRuntimeAvailable(key, params.desktopTools)
    ? key
    : null;
}

export function resolveThreadRuntimeOption(params: {
  catalog: AgentRuntimeCatalog;
  thread?: Pick<AgentThread, 'requestedModel' | 'runtimeKey'> | null;
}): AgentRuntimeOption {
  const runtimeKey = params.thread?.runtimeKey?.trim();
  if (runtimeKey) {
    const byRuntimeKey = params.catalog.options.find(
      (option) => option.key === runtimeKey,
    );

    if (byRuntimeKey) {
      return byRuntimeKey;
    }
  }

  const requestedModel = params.thread?.requestedModel?.trim();
  if (requestedModel) {
    const byRequestedModel = params.catalog.options.find(
      (option) => option.requestedModel === requestedModel,
    );

    if (byRequestedModel) {
      return byRequestedModel;
    }
  }

  return params.catalog.options[0];
}
