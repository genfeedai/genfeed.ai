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

/** The credit-billed Genfeed runtime a local CLI thread can be moved to. */
export const HOSTED_GENFEED_RUNTIME_OPTION: AgentRuntimeOption = {
  category: 'hosted',
  description: 'Genfeed hosted runtime',
  key: 'hosted/genfeed',
  label: 'Genfeed',
  provider: 'genfeed',
  requestedModel: '',
};

const HOSTED_RUNTIME_OPTIONS: AgentRuntimeOption[] = [
  {
    category: 'auto',
    description: 'Use the conversation default routing path',
    key: '',
    label: 'Auto',
    provider: 'genfeed',
    requestedModel: '',
  },
  HOSTED_GENFEED_RUNTIME_OPTION,
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

function getLocalToolNotice(
  desktopTools?: IDesktopLocalToolReadiness | null,
): string | null {
  const messages = (desktopTools?.upgradesRequired ?? []).map(
    (upgrade) => upgrade.message,
  );

  return messages.length > 0 ? messages.join(' ') : null;
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
    localToolNotice: getLocalToolNotice(params.desktopTools),
    localToolSummary: getLocalToolSummary(params.desktopTools),
    options: [autoOption, ...localOptions, ...hostedOptions],
    providerSummary: getProviderSummary(params.readiness),
  };
}

export const DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE =
  'Checking the local CLI on this computer. Send again in a moment.';

/** The picker option for a local CLI runtime, installed or not. */
export function getDesktopCliRuntimeOption(
  key: AgentExternalRuntimeKey,
): AgentRuntimeOption {
  return key === AGENT_EXTERNAL_RUNTIME_KEYS.CLAUDE_CLI
    ? DESKTOP_CLAUDE_CLI_RUNTIME_OPTION
    : DESKTOP_CODEX_CLI_RUNTIME_OPTION;
}

function resolveBoundCliRuntimeKey(params: {
  activeThreadId: string | null;
  draftRuntimeKey?: string | null;
  thread?: Pick<AgentThread, 'runtimeKey'> | null;
}): AgentExternalRuntimeKey | null {
  const key = params.activeThreadId
    ? params.thread?.runtimeKey
    : params.draftRuntimeKey;

  return isDesktopCliRuntimeKey(key) ? key : null;
}

/**
 * The local CLI runtime the active thread (or the draft runtime for a new
 * thread) is bound to in Desktop, or null for the hosted API path. It stays
 * bound while the CLI is missing or outdated: sends are blocked (see
 * `resolveDesktopCliRuntimeBlocker`) instead of silently spending Genfeed
 * credits on the hosted runtime.
 */
export function resolveDesktopCliRuntimeKey(params: {
  activeThreadId: string | null;
  draftRuntimeKey?: string | null;
  hasDesktopBridge: boolean;
  thread?: Pick<AgentThread, 'runtimeKey'> | null;
}): AgentExternalRuntimeKey | null {
  if (!params.hasDesktopBridge) {
    return null;
  }

  return resolveBoundCliRuntimeKey(params);
}

/**
 * The local CLI runtime the active thread (or the draft) is bound to when this
 * is NOT Desktop. A plain browser cannot run it, so sends are blocked (see
 * `useDesktopCliAgentChat`) until the user moves the thread to a hosted
 * runtime or opens it in Desktop; they never silently spend Genfeed credits.
 */
export function resolveWebCliRuntimeKey(params: {
  activeThreadId: string | null;
  draftRuntimeKey?: string | null;
  hasDesktopBridge: boolean;
  thread?: Pick<AgentThread, 'runtimeKey'> | null;
}): AgentExternalRuntimeKey | null {
  if (params.hasDesktopBridge) {
    return null;
  }

  return resolveBoundCliRuntimeKey(params);
}

/**
 * Why a local CLI runtime cannot take a turn on this desktop, or null when it
 * can. `desktopTools` is null when detection failed.
 */
export function resolveDesktopCliRuntimeBlocker(
  key: AgentExternalRuntimeKey,
  desktopTools: IDesktopLocalToolReadiness | null,
): string | null {
  if (isDesktopCliRuntimeAvailable(key, desktopTools)) {
    return null;
  }

  const option = getDesktopCliRuntimeOption(key);
  const upgrade = desktopTools?.upgradesRequired?.find(
    (item) => item.key === option.provider,
  );
  const reason =
    upgrade?.message ??
    `${option.label} was not found on this computer. Install it, then restart Genfeed Desktop.`;

  return `${reason} This thread runs on ${option.label}; to use Genfeed credits instead, pick a Genfeed runtime for it.`;
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

    // A thread bound to a CLI that is not usable here still shows that CLI.
    if (isDesktopCliRuntimeKey(runtimeKey)) {
      return getDesktopCliRuntimeOption(runtimeKey);
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
