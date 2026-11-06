// @vitest-environment jsdom
'use client';

import type { IModel, ITraining } from '@genfeedai/contracts/interfaces';
import {
  type PromptBarContextValue,
  usePromptBarContext,
} from '@providers/promptbar/promptbar.context';
import PromptBarProvider from '@providers/promptbar/promptbar.provider';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useBrandMock = vi.fn();
const useAuthedServiceMock = vi.fn();

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthMock(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) =>
    useAuthedServiceMock(factory),
}));

// The provider logs from inside the catalog `try`, so a double that omits the
// level it calls throws a TypeError the catch swallows — every picker then
// reports an empty catalog instead of a failed one. Mirror the real logger's
// full surface (debug/error/info/warn) rather than the levels used today.
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

interface StubService {
  findAllPages: ReturnType<typeof vi.fn>;
}

function makeService(result: unknown[] | Error): StubService {
  const findAllPages =
    result instanceof Error
      ? vi.fn().mockRejectedValue(result)
      : vi.fn().mockResolvedValue(result);
  return { findAllPages };
}

function makeModel(id: string, key: string, label: string): IModel {
  return { id, key, label } as unknown as IModel;
}

function makeTraining(id: string, label: string): ITraining {
  return {
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    description: 'trained model',
    id,
    label,
    model: 'flux-dev-lora',
    trigger: 'TOK',
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  } as unknown as ITraining;
}

let contextValue: PromptBarContextValue;

function Consumer(): null {
  contextValue = usePromptBarContext();
  return null;
}

function installServices(services: StubService[]): void {
  let callIndex = 0;
  useAuthedServiceMock.mockImplementation(() => {
    const service = services[callIndex % services.length];
    callIndex += 1;
    return vi.fn().mockResolvedValue(service);
  });
}

describe('usePromptBarContext', () => {
  it('throws when used outside PromptBarProvider', () => {
    expect(() => renderHook(() => usePromptBarContext())).toThrowError(
      /usePromptBarContext must be used within a PromptBarProvider/,
    );
  });
});

describe('PromptBarProvider behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: null,
      userId: 'user_1',
    });
    useBrandMock.mockReturnValue({
      organizationId: '',
      settings: null,
    });
  });

  it('exposes all models plus mapped training models for personal accounts', async () => {
    const fontsService = makeService([{ id: 'font_1' }]);
    const presetsService = makeService([{ id: 'preset_1' }]);
    const modelsService = makeService([
      makeModel('model_1', 'model-one', 'Model One'),
    ]);
    const trainingsService = makeService([makeTraining('training_1', 'LoRA')]);
    const tagsService = makeService([{ id: 'tag_1' }]);
    installServices([
      fontsService,
      presetsService,
      modelsService,
      trainingsService,
      tagsService,
    ]);

    render(
      <PromptBarProvider>
        <Consumer />
      </PromptBarProvider>,
    );

    await waitFor(() => {
      expect(contextValue.isLoading).toBe(false);
    });

    expect(contextValue.models).toHaveLength(2);
    const trainingModel = contextValue.models.find(
      (model) => model.id === 'training_1',
    ) as (IModel & { isTraining: boolean }) | undefined;
    expect(trainingModel?.isTraining).toBe(true);
    expect(trainingModel?.trigger).toBe('TOK');
    expect(contextValue.fontFamilies).toHaveLength(1);
    expect(contextValue.presets).toHaveLength(1);
    expect(contextValue.tags).toHaveLength(1);
    expect(contextValue.trainings).toHaveLength(1);
    expect(contextValue.error).toBeNull();
  });

  it('filters org models by enabled ids, keeping key matches and trainings', async () => {
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_1',
      userId: 'user_1',
    });
    useBrandMock.mockReturnValue({
      organizationId: 'org_1',
      settings: { enabledModelIds: ['by-key'] },
    });

    installServices([
      makeService([]),
      makeService([]),
      makeService([
        makeModel('model_a', 'by-key', 'Key Match'),
        makeModel('model_b', 'other', 'Filtered Out'),
      ]),
      makeService([makeTraining('training_2', 'Training Two')]),
      makeService([]),
    ]);

    render(
      <PromptBarProvider>
        <Consumer />
      </PromptBarProvider>,
    );

    await waitFor(() => {
      expect(contextValue.isLoading).toBe(false);
    });

    expect(contextValue.models.map((model) => model.id).sort()).toEqual([
      'model_a',
      'training_2',
    ]);
  });

  it('returns no models when the org has no enabled model ids', async () => {
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_1',
      userId: 'user_1',
    });
    useBrandMock.mockReturnValue({
      organizationId: 'org_1',
      settings: { enabledModelIds: [] },
    });

    installServices([
      makeService([]),
      makeService([]),
      makeService([makeModel('model_a', 'a', 'A')]),
      makeService([]),
      makeService([]),
    ]);

    render(
      <PromptBarProvider>
        <Consumer />
      </PromptBarProvider>,
    );

    await waitFor(() => {
      expect(contextValue.isLoading).toBe(false);
    });
    expect(contextValue.models).toEqual([]);
  });

  it('returns no models while the org settings are still unknown', async () => {
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_1',
      userId: 'user_1',
    });
    useBrandMock.mockReturnValue({
      organizationId: 'org_1',
      settings: null,
    });

    installServices([
      makeService([]),
      makeService([]),
      makeService([makeModel('model_a', 'a', 'A')]),
      makeService([]),
      makeService([]),
    ]);

    render(
      <PromptBarProvider>
        <Consumer />
      </PromptBarProvider>,
    );

    await waitFor(() => {
      expect(contextValue.isLoading).toBe(false);
    });
    expect(contextValue.models).toEqual([]);
  });

  it('surfaces a load error when a catalog request fails', async () => {
    installServices([
      makeService([]),
      makeService([]),
      makeService(new Error('models exploded')),
      makeService([]),
      makeService([]),
    ]);

    render(
      <PromptBarProvider>
        <Consumer />
      </PromptBarProvider>,
    );

    await waitFor(() => {
      expect(contextValue.isLoading).toBe(false);
    });

    expect(contextValue.error?.message).toBe('models exploded');
    expect(contextValue.models).toEqual([]);
  });

  it('stays idle when signed out', async () => {
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      orgId: null,
      userId: null,
    });
    installServices([makeService([])]);

    render(
      <PromptBarProvider>
        <Consumer />
      </PromptBarProvider>,
    );

    await waitFor(() => {
      expect(contextValue.isLoading).toBe(false);
    });
    expect(contextValue.models).toEqual([]);
    expect(contextValue.error).toBeNull();
  });

  it('stays idle when disabled', async () => {
    installServices([makeService([])]);

    render(
      <PromptBarProvider enabled={false}>
        <Consumer />
      </PromptBarProvider>,
    );

    await waitFor(() => {
      expect(contextValue.isLoading).toBe(false);
    });
    expect(contextValue.models).toEqual([]);
  });

  it('refetch reloads catalogs and notifies subscribed refresh callbacks', async () => {
    const modelsService = makeService([makeModel('model_1', 'one', 'One')]);
    installServices([
      makeService([]),
      makeService([]),
      modelsService,
      makeService([]),
      makeService([]),
    ]);

    render(
      <PromptBarProvider>
        <Consumer />
      </PromptBarProvider>,
    );

    await waitFor(() => {
      expect(contextValue.isLoading).toBe(false);
    });
    const initialFetchCount = modelsService.findAllPages.mock.calls.length;

    const refreshCallback = vi.fn();
    // PromptBarContextValue types onRefresh as returning void, but the
    // provider implementation returns an unsubscribe function.
    const subscribe = contextValue.onRefresh as
      | ((callback: () => void) => () => void)
      | undefined;
    let unsubscribe: (() => void) | undefined;
    act(() => {
      unsubscribe = subscribe?.(refreshCallback);
    });

    await act(async () => {
      await contextValue.refetch();
    });

    expect(modelsService.findAllPages.mock.calls.length).toBeGreaterThan(
      initialFetchCount,
    );
    expect(refreshCallback).toHaveBeenCalledTimes(1);

    act(() => {
      unsubscribe?.();
    });
    await act(async () => {
      await contextValue.refetch();
    });
    expect(refreshCallback).toHaveBeenCalledTimes(1);
  });
});
