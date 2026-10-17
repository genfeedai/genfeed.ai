import { RouterPriority } from '@genfeedai/contracts';
import type {
  IStudioLook,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces';
import type { GenerationSetupValues } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import {
  buildStudioLookPayload,
  presetToGenerationSetupValues,
  useStudioLooks,
} from '@pages/studio/playground/hooks/useStudioLooks';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const brandContext = {
    brandId: 'brand-a',
    organizationId: 'org-1',
  };
  const service = {
    findForAssetType: vi.fn(),
    post: vi.fn(),
    removeLook: vi.fn(),
  };
  return {
    brandContext,
    identity: { userId: 'user-1', sessionId: 'session-1' },
    apiEndpoint: 'https://api.example.test',
    getService: vi.fn(async () => service),
    service,
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brandContext,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.identity,
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    get apiEndpoint() {
      return mocks.apiEndpoint;
    },
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const values: GenerationSetupValues = {
  aspectRatio: '1:1',
  brandingMode: 'brand',
  camera: 'camera-1',
  cameraMovement: 'move-1',
  duration: 8,
  isPromptEnhanceEnabled: true,
  lens: 'lens-1',
  lighting: 'lighting-1',
  modelKey: 'model-1',
  mood: 'mood-1',
  outputs: 4,
  prioritize: RouterPriority.BALANCED,
  promptTemplate: 'preset-1',
  resolution: '1K',
  scene: 'scene-1',
  style: 'style-1',
  type: 'video',
};

const look: IStudioLook = {
  aspectRatio: 'saved-aspect',
  assetType: 'video',
  brandId: 'brand-a',
  brandingMode: 'brand',
  camera: 'saved-camera',
  cameraMovement: 'saved-move',
  createdAt: '2026-08-26T00:00:00.000Z',
  duration: 12,
  id: 'look-a',
  isDeleted: false,
  label: 'Saved',
  lens: 'saved-lens',
  lighting: 'saved-lighting',
  modelKey: 'saved-model',
  mood: 'saved-mood',
  organizationId: 'org-1',
  outputs: 2,
  prioritize: RouterPriority.QUALITY,
  promptTemplate: 'saved-preset',
  resolution: 'saved-resolution',
  scene: 'saved-scene',
  style: 'saved-style',
  updatedAt: '2026-08-26T00:00:00.000Z',
  userId: 'user-1',
};

describe('Studio Look preset contract', () => {
  it('captures every widened Preset field from the shared generation-setup values', () => {
    expect(buildStudioLookPayload(' Saved ', 'video', values)).toEqual({
      aspectRatio: '1:1',
      assetType: 'video',
      brandingMode: 'brand',
      camera: 'camera-1',
      cameraMovement: 'move-1',
      duration: 8,
      label: 'Saved',
      lens: 'lens-1',
      lighting: 'lighting-1',
      modelKey: 'model-1',
      mood: 'mood-1',
      outputs: 4,
      prioritize: RouterPriority.BALANCED,
      promptTemplate: 'preset-1',
      resolution: '1K',
      scene: 'scene-1',
      style: 'style-1',
    });
  });

  it('nulls cameraMovement and duration for image Presets', () => {
    const imageValues: GenerationSetupValues = { ...values, type: 'image' };
    const payload = buildStudioLookPayload('Saved', 'image', imageValues);
    expect(payload.cameraMovement).toBeNull();
    expect(payload.duration).toBeNull();
  });

  it('treats an empty modelKey (Auto) as null', () => {
    const autoValues: GenerationSetupValues = { ...values, modelKey: '' };
    expect(buildStudioLookPayload('Saved', 'video', autoValues).modelKey).toBe(
      null,
    );
  });

  it('projects every persisted Preset field back onto generation-setup values', () => {
    expect(presetToGenerationSetupValues(look)).toEqual({
      aspectRatio: 'saved-aspect',
      brandingMode: 'brand',
      camera: 'saved-camera',
      cameraMovement: 'saved-move',
      duration: 12,
      lens: 'saved-lens',
      lighting: 'saved-lighting',
      modelKey: 'saved-model',
      mood: 'saved-mood',
      outputs: 2,
      prioritize: RouterPriority.QUALITY,
      promptTemplate: 'saved-preset',
      resolution: 'saved-resolution',
      scene: 'saved-scene',
      style: 'saved-style',
    });
  });

  it('omits video-only fields when projecting an image Preset', () => {
    const imageLook: IStudioLook = {
      ...look,
      assetType: 'image',
      cameraMovement: 'stale-move',
      duration: 5,
    };
    const patch = presetToGenerationSetupValues(imageLook);
    expect(patch.cameraMovement).toBeUndefined();
    expect(patch.duration).toBeUndefined();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

type ScopeChange = 'actor' | 'session' | 'organization' | 'brand' | 'api';
function changeScope(change: ScopeChange) {
  if (change === 'actor') mocks.identity.userId = 'user-2';
  else if (change === 'session') mocks.identity.sessionId = 'session-2';
  else if (change === 'organization')
    mocks.brandContext.organizationId = 'org-2';
  else if (change === 'brand') mocks.brandContext.brandId = 'brand-b';
  else mocks.apiEndpoint = 'https://second-api.example.test';
}

describe('useStudioLooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandContext.brandId = 'brand-a';
    mocks.brandContext.organizationId = 'org-1';
    mocks.identity.userId = 'user-1';
    mocks.identity.sessionId = 'session-1';
    mocks.apiEndpoint = 'https://api.example.test';
    mocks.getService.mockReset().mockResolvedValue(mocks.service);
    mocks.service.findForAssetType.mockReset().mockResolvedValue([look]);
    mocks.service.post.mockReset().mockResolvedValue(look);
    mocks.service.removeLook.mockReset().mockResolvedValue(undefined);
  });

  it('hides the previous brand snapshot immediately when the active brand changes', async () => {
    const { rerender, result } = renderHook(() => useStudioLooks('video'));

    await waitFor(() => expect(result.current.looks).toEqual([look]));

    mocks.brandContext.brandId = 'brand-b';
    mocks.service.findForAssetType.mockReturnValueOnce(new Promise(() => {}));
    rerender();

    expect(result.current.looks).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('saves a Look built from the full generation-setup values', async () => {
    mocks.service.post.mockResolvedValue(look);
    const { result } = renderHook(() => useStudioLooks('video'));

    await waitFor(() => expect(result.current.looks).toEqual([look]));

    await act(async () => {
      await result.current.saveLook('New Preset', values);
    });

    expect(mocks.service.post).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: values.aspectRatio,
        label: 'New Preset',
        modelKey: values.modelKey,
      }),
    );
    expect(mocks.service.post).toHaveBeenCalledWith(
      expect.not.objectContaining({
        isPromptEnhanceEnabled: expect.anything(),
      }),
    );
  });

  it.each([
    'actor',
    'session',
    'organization',
    'brand',
    'api',
    'type',
  ] as const)(
    'immediately hides the previous owner snapshot when %s changes',
    async (change) => {
      const { result, rerender } = renderHook(
        ({ type }) => useStudioLooks(type),
        { initialProps: { type: 'video' as StudioPlaygroundType } },
      );
      await waitFor(() => expect(result.current.looks).toEqual([look]));
      mocks.service.findForAssetType.mockReturnValueOnce(new Promise(() => {}));
      if (change !== 'type') changeScope(change);
      rerender({ type: change === 'type' ? 'image' : 'video' });
      expect(result.current.looks).toEqual([]);
      expect(result.current.isLoading).toBe(true);
    },
  );

  it.each(['save', 'delete'] as const)(
    'does not dispatch an old %s after actor change during service acquisition',
    async (operation) => {
      const { result, rerender } = renderHook(() => useStudioLooks('video'));
      await waitFor(() => expect(result.current.looks).toEqual([look]));
      const acquisition = deferred<typeof mocks.service>();
      mocks.getService.mockReturnValueOnce(acquisition.promise);
      let pending!: Promise<boolean>;
      act(() => {
        pending =
          operation === 'save'
            ? result.current.saveLook('Old owner', values)
            : result.current.deleteLook(look.id);
      });
      changeScope('actor');
      rerender();
      await act(async () => {
        acquisition.resolve(mocks.service);
        expect(await pending).toBe(false);
      });
      expect(mocks.service.post).not.toHaveBeenCalled();
      expect(mocks.service.removeLook).not.toHaveBeenCalled();
    },
  );

  it.each(['save', 'delete'] as const)(
    'does not revive an old %s after a brand scope round trip during acquisition',
    async (operation) => {
      const { result, rerender } = renderHook(() => useStudioLooks('video'));
      await waitFor(() => expect(result.current.looks).toEqual([look]));
      const acquisition = deferred<typeof mocks.service>();
      mocks.getService.mockReturnValueOnce(acquisition.promise);
      let pending!: Promise<boolean>;
      act(() => {
        pending =
          operation === 'save'
            ? result.current.saveLook('Old owner', values)
            : result.current.deleteLook(look.id);
      });
      mocks.brandContext.brandId = 'brand-b';
      rerender();
      mocks.brandContext.brandId = 'brand-a';
      rerender();
      await act(async () => {
        acquisition.resolve(mocks.service);
        expect(await pending).toBe(false);
      });
      expect(mocks.service.post).not.toHaveBeenCalled();
      expect(mocks.service.removeLook).not.toHaveBeenCalled();
    },
  );

  it.each(['save', 'delete'] as const)(
    'does not dispatch an old %s after unmount during service acquisition',
    async (operation) => {
      const { result, unmount } = renderHook(() => useStudioLooks('video'));
      await waitFor(() => expect(result.current.looks).toEqual([look]));
      const acquisition = deferred<typeof mocks.service>();
      mocks.getService.mockReturnValueOnce(acquisition.promise);
      let pending!: Promise<boolean>;
      act(() => {
        pending =
          operation === 'save'
            ? result.current.saveLook('Old owner', values)
            : result.current.deleteLook(look.id);
      });
      unmount();
      await act(async () => {
        acquisition.resolve(mocks.service);
        expect(await pending).toBe(false);
      });
      expect(mocks.service.post).not.toHaveBeenCalled();
      expect(mocks.service.removeLook).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['save', 'success'],
    ['save', 'failure'],
    ['delete', 'success'],
    ['delete', 'failure'],
  ] as const)(
    'ignores stale %s %s after a scope round trip while a new action is pending',
    async (operation, outcome) => {
      const oldRequest = deferred<IStudioLook | undefined>();
      const newRequest = deferred<IStudioLook | undefined>();
      const method =
        operation === 'save' ? mocks.service.post : mocks.service.removeLook;
      method
        .mockReturnValueOnce(oldRequest.promise)
        .mockReturnValueOnce(newRequest.promise);
      const { result, rerender } = renderHook(() => useStudioLooks('video'));
      await waitFor(() => expect(result.current.looks).toEqual([look]));
      let oldPending!: Promise<boolean>;
      act(() => {
        oldPending =
          operation === 'save'
            ? result.current.saveLook('Old owner', values)
            : result.current.deleteLook(look.id);
      });
      await waitFor(() => expect(method).toHaveBeenCalledTimes(1));
      mocks.brandContext.brandId = 'brand-b';
      rerender();
      await waitFor(() =>
        expect(mocks.service.findForAssetType).toHaveBeenCalledTimes(2),
      );
      const currentLook = { ...look, label: 'Fresh owner snapshot' };
      mocks.service.findForAssetType.mockResolvedValueOnce([currentLook]);
      mocks.brandContext.brandId = 'brand-a';
      rerender();
      await waitFor(() => expect(result.current.looks).toEqual([currentLook]));
      let newPending!: Promise<boolean>;
      act(() => {
        newPending =
          operation === 'save'
            ? result.current.saveLook('Current owner', values)
            : result.current.deleteLook('current-delete-target');
      });
      await waitFor(() => expect(method).toHaveBeenCalledTimes(2));
      await act(async () => {
        if (outcome === 'success')
          oldRequest.resolve(operation === 'save' ? look : undefined);
        else oldRequest.reject(new Error('Old owner failure'));
        expect(await oldPending).toBe(false);
      });
      expect(result.current.looks).toEqual([currentLook]);
      expect(result.current.error).toBeNull();
      expect(
        operation === 'save'
          ? result.current.isSaving
          : result.current.deletingId,
      ).toBe(operation === 'save' ? true : 'current-delete-target');
      await act(async () => {
        newRequest.resolve(
          operation === 'save' ? { ...look, id: 'new-look' } : undefined,
        );
        expect(await newPending).toBe(true);
      });
    },
  );

  it('captures save values before waiting for the auth service', async () => {
    const { result } = renderHook(() => useStudioLooks('video'));
    await waitFor(() => expect(result.current.looks).toEqual([look]));
    const acquisition = deferred<typeof mocks.service>();
    mocks.getService.mockReturnValueOnce(acquisition.promise);
    const input = { ...values };
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.saveLook('  Original  ', input);
    });
    input.modelKey = 'retargeted-model';
    input.aspectRatio = '9:16';
    await act(async () => {
      acquisition.resolve(mocks.service);
      expect(await pending).toBe(true);
    });
    expect(mocks.service.post).toHaveBeenCalledExactlyOnceWith(
      buildStudioLookPayload('Original', 'video', values),
    );
  });

  it.each(['success', 'failure'] as const)(
    'ignores an aborted GET %s after a scope round trip',
    async (outcome) => {
      const oldRequest = deferred<IStudioLook[]>();
      mocks.service.findForAssetType.mockReturnValueOnce(oldRequest.promise);
      const { result, rerender } = renderHook(() => useStudioLooks('video'));
      await waitFor(() =>
        expect(mocks.service.findForAssetType).toHaveBeenCalledTimes(1),
      );
      const oldSignal = mocks.service.findForAssetType.mock
        .calls[0][1] as AbortSignal;
      mocks.brandContext.brandId = 'brand-b';
      rerender();
      await waitFor(() =>
        expect(mocks.service.findForAssetType).toHaveBeenCalledTimes(2),
      );
      const currentLook = { ...look, id: 'fresh-look' };
      mocks.service.findForAssetType.mockResolvedValueOnce([currentLook]);
      mocks.brandContext.brandId = 'brand-a';
      rerender();
      await waitFor(() => expect(result.current.looks).toEqual([currentLook]));
      expect(oldSignal.aborted).toBe(true);
      await act(async () => {
        if (outcome === 'success') oldRequest.resolve([look]);
        else oldRequest.reject(new Error('Old read failure'));
        await oldRequest.promise.catch(() => {});
      });
      expect(result.current.looks).toEqual([currentLook]);
      expect(result.current.error).toBeNull();
    },
  );

  it('does not start an aborted read after service acquisition finishes on unmount', async () => {
    const acquisition = deferred<typeof mocks.service>();
    mocks.getService.mockReturnValueOnce(acquisition.promise);
    const { unmount } = renderHook(() => useStudioLooks('video'));
    unmount();
    await act(async () => {
      acquisition.resolve(mocks.service);
      await acquisition.promise;
    });
    expect(mocks.service.findForAssetType).not.toHaveBeenCalled();
  });

  it('preserves a current owner delete and normal failure feedback', async () => {
    const { result } = renderHook(() => useStudioLooks('video'));
    await waitFor(() => expect(result.current.looks).toEqual([look]));
    mocks.service.removeLook.mockRejectedValueOnce(
      new Error('Current failure'),
    );
    await act(async () => {
      expect(await result.current.deleteLook(look.id)).toBe(false);
    });
    expect(result.current.error).toBe('This Look could not be deleted.');
    expect(result.current.looks).toEqual([look]);
    await act(async () => {
      expect(await result.current.deleteLook(look.id)).toBe(true);
    });
    expect(mocks.service.removeLook).toHaveBeenLastCalledWith(look.id);
    expect(result.current.looks).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.deletingId).toBeNull();
  });

  it('preserves current owner load and save failure feedback', async () => {
    mocks.service.findForAssetType.mockRejectedValueOnce(
      new Error('Current load failure'),
    );
    const { result } = renderHook(() => useStudioLooks('video'));
    await waitFor(() =>
      expect(result.current.error).toBe('Saved Looks could not be loaded.'),
    );
    mocks.service.post.mockRejectedValueOnce(new Error('Current save failure'));
    await act(async () => {
      expect(await result.current.saveLook('Current', values)).toBe(false);
    });
    expect(result.current.error).toBe(
      'This Look could not be saved. Your settings are unchanged.',
    );
    expect(result.current.isSaving).toBe(false);
  });
});
