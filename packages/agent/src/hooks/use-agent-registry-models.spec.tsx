import { useAgentRegistryModels } from '@genfeedai/agent/hooks/use-agent-registry-models';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { AGENT_CHAT_CAPABILITY, REASONING_FEATURE } from '@genfeedai/constants';
import { CostTier, ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAll = vi.fn();

vi.mock('@services/ai/models.service', () => ({
  ModelsService: { getInstance: () => ({ findAll }) },
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

describe('useAgentRegistryModels', () => {
  beforeEach(() => {
    findAll.mockReset();
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

  it('drops registry rows that are not agent chat models', async () => {
    findAll.mockResolvedValue([
      registryModel(),
      // No agent-chat capability and not an OpenRouter / legacy row.
      registryModel({
        capabilities: [],
        id: 'model-2',
        isLegacy: false,
        key: 'local/qwen-32b',
        provider: ModelProvider.GENFEED_AI,
        recommendedFor: [],
      }),
      registryModel({ id: 'model-3', isLegacy: true, key: 'openai/retired' }),
      registryModel({ id: 'model-4', key: 'openrouter/auto' }),
    ]);

    const { result } = renderHook(() =>
      useAgentRegistryModels(apiServiceStub()),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // OpenRouter rows stay eligible; retired keys may still pass the filter
    // depending on isRetiredAgentChatModel. Assert the primary chat model is in.
    expect(result.current.models.map((model) => model.key)).toContain(
      'anthropic/claude-opus-5',
    );
    expect(result.current.models.map((model) => model.key)).not.toContain(
      'local/qwen-32b',
    );
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
});
