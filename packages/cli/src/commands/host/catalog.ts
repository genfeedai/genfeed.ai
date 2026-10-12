import type { NativeHostProviderId } from '@genfeedai/contracts/api-types/contracts/native-host.contract';
import { NATIVE_HOST_PROVIDER_LABELS } from '@genfeedai/contracts/constants';

export interface CliProviderDefinition {
  executable: string;
  id: Extract<NativeHostProviderId, `${string}-cli`>;
  kind: 'cli';
  label: string;
}

export interface ApiProviderDefinition {
  id: Extract<NativeHostProviderId, `${string}-api`>;
  kind: 'api';
  label: string;
}

export type ProviderDefinition = CliProviderDefinition | ApiProviderDefinition;

/** Every provider a host can run, in the order the extension lists them. */
export const PROVIDER_CATALOG: readonly ProviderDefinition[] = [
  {
    executable: 'claude',
    id: 'claude-cli',
    kind: 'cli',
    label: NATIVE_HOST_PROVIDER_LABELS['claude-cli'],
  },
  {
    executable: 'codex',
    id: 'codex-cli',
    kind: 'cli',
    label: NATIVE_HOST_PROVIDER_LABELS['codex-cli'],
  },
  {
    executable: 'gemini',
    id: 'gemini-cli',
    kind: 'cli',
    label: NATIVE_HOST_PROVIDER_LABELS['gemini-cli'],
  },
  { id: 'openai-api', kind: 'api', label: NATIVE_HOST_PROVIDER_LABELS['openai-api'] },
  { id: 'anthropic-api', kind: 'api', label: NATIVE_HOST_PROVIDER_LABELS['anthropic-api'] },
  { id: 'gemini-api', kind: 'api', label: NATIVE_HOST_PROVIDER_LABELS['gemini-api'] },
];

export function findProvider(id: NativeHostProviderId): ProviderDefinition {
  const provider = PROVIDER_CATALOG.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Unknown provider ${id}`);
  return provider;
}

export function isApiProvider(provider: ProviderDefinition): provider is ApiProviderDefinition {
  return provider.kind === 'api';
}
