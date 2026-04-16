import { DEFAULT_RUNTIME_AGENT_MODEL } from '@genfeedai/agent/constants/agent-runtime-model.constant';
import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type {
  AgentRuntimeCatalog,
  AgentRuntimeOption,
} from '@genfeedai/agent/models/agent-runtime.model';
import type { AgentInstallReadiness } from '@genfeedai/agent/services/agent-api.service';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', '::1', 'localhost']);

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
    requestedModel: DEFAULT_RUNTIME_AGENT_MODEL,
  },
  {
    category: 'hosted',
    description: 'OpenRouter auto routing',
    key: 'hosted/openrouter',
    label: 'OpenRouter',
    provider: 'openrouter',
    requestedModel: 'openrouter/auto',
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

const LOCAL_CLAUDE_OPTION: AgentRuntimeOption = {
  category: 'local',
  description: 'Local Claude CLI detected on this machine',
  key: 'local/claude-cli',
  label: 'Claude CLI',
  provider: 'claude',
  requestedModel: 'anthropic/claude-sonnet-4-5-20250929',
};

const LOCAL_CODEX_OPTION: AgentRuntimeOption = {
  category: 'local',
  description: 'Local Codex CLI detected on this machine',
  key: 'local/codex-cli',
  label: 'Codex CLI',
  provider: 'codex',
  requestedModel: 'openai/o4-mini',
};

function getLocalToolSummary(readiness?: AgentInstallReadiness | null): string {
  const detected = readiness?.localTools.detected ?? [];
  if (detected.length === 0) {
    return 'No local CLIs detected';
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

export function isLocalTerminalHost(hostname?: string | null): boolean {
  if (!hostname) {
    return false;
  }

  return LOCAL_HOSTNAMES.has(hostname);
}

export function buildAgentRuntimeCatalog(params: {
  hostname?: string | null;
  readiness?: AgentInstallReadiness | null;
}): AgentRuntimeCatalog {
  const isLocal = isLocalTerminalHost(params.hostname);
  const options = [...HOSTED_RUNTIME_OPTIONS];

  if (isLocal) {
    if (params.readiness?.localTools.codex) {
      options.splice(1, 0, LOCAL_CODEX_OPTION);
    }

    if (params.readiness?.localTools.claude) {
      options.splice(
        params.readiness.localTools.codex ? 2 : 1,
        0,
        LOCAL_CLAUDE_OPTION,
      );
    }
  }

  return {
    environmentLabel: isLocal ? 'local' : 'cloud',
    localToolSummary: getLocalToolSummary(params.readiness),
    options,
    providerSummary: getProviderSummary(params.readiness),
  };
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
