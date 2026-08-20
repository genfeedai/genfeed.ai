import { useAgentRegistryModels } from '@genfeedai/agent/hooks/use-agent-registry-models';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  AGENT_CHAT_CAPABILITY,
  REASONING_FEATURE,
  RETIRED_AGENT_CHAT_MODELS,
} from '@genfeedai/constants';
import { CostTier, ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAll = vi.fn();

const { brandState } = vi.hoisted(() => ({
  brandState: {
    organizationId: '',
    settings: null as { enabledModelIds?: string[] } | null,
    settingsLoading: false,
  },
}));

vi.mock('@services/ai/models.service', () => ({
  ModelsService: { getInstance: () => ({ findAll }) },
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandState,
}));

function registryModel(overrides: Partial<IModel> = {}): IModel {
  return {
    capabilities: [AGENT_CHAT_CAPABILITY],
    category: ModelCategory.TEXT,
    cost: 12,
    costTier: CostTier.MEDIUM,
    description: 'Registry description',
    id: 'model-1',
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: 'anthropic/claude-opus-5',
    label: 'Claude Opus 5',
    provider: ModelProvider.OPENROUTER,
    ...overrides,
  } as IModel;
}

function apiServiceStub(): AgentApiService {
  return {
    getToken: vi.fn().mockResolvedValue('token'),
  } as unknown as AgentApiService;
}

const retiredFixtureKey = Object.keys(RETIRED_AGENT_CHAT_MODELS)[0];

if (!retiredFixtureKey) {
  throw new Error('Registry filter fixtures require a retired model key');
}

const registryFilterFixtures = [
  registryModel({
    cost: 10,
    id: 'capability-model',
    key: 'fixture/capability-model',
    label: 'Capability model',
    provider: ModelProvider.GENFEED_AI,
  }),
  registryModel({
    capabilities: [],
    cost: 20,
    id: 'recommended-model',
    key: 'fixture/recommended-model',
    label: 'Recommended model',
    provider: ModelProvider.GENFEED_AI,
    recommendedFor: [AGENT_CHAT_CAPABILITY],
  }),
  registryModel({
    capabilities: [],
    cost: 30,
    id: 'openrouter-model',
    key: 'fixture/openrouter-model',
    label: 'OpenRouter model',
    provider: ModelProvider.OPENROUTER,
    recommendedFor: [],
  }),
  registryModel({
    capabilities: [],
    cost: 40,
    id: 'legacy-model',
    isLegacy: true,
    key: 'fixture/legacy-model',
    label: 'Legacy model',
    provider: ModelProvider.GENFEED_AI,
    recommendedFor: [],
  }),
  registryModel({
    capabilities: [],
    id: 'untagged-model',
    key: 'fixture/untagged-model',
    label: 'Untagged model',
    provider: ModelProvider.GENFEED_AI,
    recommendedFor: [],
  }),
  registryModel({
    id: 'inactive-model',
    isActive: false,
    key: 'fixture/inactive-model',
    label: 'Inactive model',
  }),
  registryModel({
    category: ModelCategory.IMAGE,
    id: 'image-model',
    key: 'fixture/image-model',
    label: 'Image model',
  }),
  registryModel({
    id: 'retired-model',
    key: retiredFixtureKey,
    label: 'Retired model',
  }),
];

const expectedRegistryFilterKeys = [
  'fixture/capability-model',
  'fixture/recommended-model',
  'fixture/openrouter-model',
  'fixture/legacy-model',
];

describe('useAgentRegistryModels', () => {
  beforeEach(() => {
    findAll.mockReset();
    brandState.organizationId = '';
    brandState.settings = null;
    brandState.settingsLoading = false;
  });

  it('maps active registry rows into picker options', async () => {
    const row = registryModel({ supportsFeatures: [REASONING_FEATURE] });
    findAll.mockResolvedValue([row]);

    const { result } = renderHook(() =>
      useAgentRegistryModels(apiServiceStub()),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Hook returns full registry rows for ModelSelectorPopover (Phase D).
    expect(result.current.models).toEqual([row]);
    expect(result.current.defaultModelKey).toBe('anthropic/claude-opus-5');
  });

  it('queries the registry for active TEXT models only', async () => {
    findAll.mockResolvedValue([registryModel()]);

    renderHook(() => useAgentRegistryModels(apiServiceStub()));

    await waitFor(() => expect(findAll).toHaveBeenCalled());
    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        category: ModelCategory.TEXT,
        isActive: true,
      }),
      expect.any(AbortSignal),
    );
  });

  it('returns the exact eligible current and legacy registry rows', async () => {
    findAll.mockResolvedValue(registryFilterFixtures);

    const { result } = renderHook(() =>
      useAgentRegistryModels(apiServiceStub()),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const modelKeys = result.current.models.map((model) => model.key);

    expect(modelKeys).toEqual(expectedRegistryFilterKeys);
    // Active legacy rows feed the Legacy rail; fully retired aliases never do.
    expect(modelKeys).not.toContain(retiredFixtureKey);
  });

  it('keeps self-hosted Genfeed registry rows when tagged for agent chat', async () => {
    findAll.mockResolvedValue([
      registryModel({
        key: 'local/qwen-32b',
        provider: ModelProvider.GENFEED_AI,
      }),
    ]);

    const { result } = renderHook(() =>
      useAgentRegistryModels(apiServiceStub()),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models[0]?.key).toBe('local/qwen-32b');
    expect(result.current.models[0]?.provider).toBe(ModelProvider.GENFEED_AI);
  });

  it('returns an empty picker when the registry request fails', async () => {
    findAll.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() =>
      useAgentRegistryModels(apiServiceStub()),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Phase D (#2422/#2472): the registry is the only source. An empty list
    // means the seed or API is incomplete — never a silent constants fallback.
    expect(result.current.models).toEqual([]);
    expect(result.current.defaultModelKey).toBeNull();
  });

  it('keeps an allowlisted chat model and hides disabled catalog rows', async () => {
    const allowed = registryModel({
      id: 'allowed-model',
      key: 'fixture/allowed-model',
      label: 'Allowed model',
    });
    const disabled = registryModel({
      id: 'disabled-model',
      key: 'fixture/disabled-model',
      label: 'Disabled model',
    });
    brandState.organizationId = 'org_demo';
    brandState.settings = { enabledModelIds: [allowed.key] };
    findAll.mockResolvedValue([allowed, disabled]);

    const { result } = renderHook(() =>
      useAgentRegistryModels(apiServiceStub()),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models.map((model) => model.key)).toEqual([
      'fixture/allowed-model',
    ]);
    expect(result.current.defaultModelKey).toBe('fixture/allowed-model');
  });

  it('returns no chat models when the org allowlist is empty', async () => {
    brandState.organizationId = 'org_demo';
    brandState.settings = { enabledModelIds: [] };
    findAll.mockResolvedValue([registryModel()]);

    const { result } = renderHook(() =>
      useAgentRegistryModels(apiServiceStub()),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models).toEqual([]);
    expect(result.current.defaultModelKey).toBeNull();
  });
});
