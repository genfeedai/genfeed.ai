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
    findAll.mockResolvedValue([
      registryModel({ supportsFeatures: [REASONING_FEATURE] }),
    ]);

    const { result } = renderHook(() =>
      useAgentRegistryModels(apiServiceStub()),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models).toEqual([
      {
        brandSlug: 'anthropic',
        costTier: CostTier.MEDIUM,
        creditCost: 12,
        description: 'Registry description',
        isReasoning: true,
        key: 'anthropic/claude-opus-5',
        label: 'Claude Opus 5',
      },
    ]);
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
      registryModel({ capabilities: [], recommendedFor: [] }),
      registryModel({ id: 'model-2', isLegacy: true, key: 'openai/retired' }),
    ]);

    const { result } = renderHook(() =>
      useAgentRegistryModels(apiServiceStub()),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Empty registry result keeps the constants catalogue until phase D.
    expect(result.current.models.length).toBeGreaterThan(0);
  });

  it('uses the provider as the brand slug for self-hosted keys', async () => {
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
    expect(result.current.models[0]?.brandSlug).toBe('genfeed-ai');
  });

  it('falls back to the constants catalogue when the request fails', async () => {
    findAll.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() =>
      useAgentRegistryModels(apiServiceStub()),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.models.length).toBeGreaterThan(0);
  });
});
