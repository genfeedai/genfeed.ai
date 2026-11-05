import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModalGenerateIllustration } from './useModalGenerateIllustration';

const { findAllPages } = vi.hoisted(() => ({ findAllPages: vi.fn() }));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@genfeedai/services/ai/models.service', () => ({
  ModelsService: { getInstance: () => ({ findAllPages }) },
}));
vi.mock('@genfeedai/services/ingredients/images.service', () => ({
  ImagesService: { getInstance: () => ({}) },
}));
vi.mock('@genfeedai/hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({ getSocketManager: () => null, isReady: false }),
}));
vi.mock(
  '@/hooks/utils/use-generation-listener/use-generation-listener',
  () => ({
    useGenerationListener: () => () => undefined,
  }),
);
vi.mock('@/hooks/ui/use-modal-auto-open/use-modal-auto-open', () => ({
  useModalAutoOpen: () => undefined,
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

const imageModels = [
  { cost: 2, isDefault: false, key: 'image-basic' },
  { cost: 5, isDefault: true, key: 'image-pro' },
] as IModel[];

function renderModal(client = createTestQueryClient(), isOpen = true) {
  return renderHook(
    () => useModalGenerateIllustration({ isOpen, onConfirm: () => undefined }),
    { wrapper: queryClientWrapper(client) },
  );
}

describe('useModalGenerateIllustration image models', () => {
  beforeEach(() => {
    findAllPages.mockReset();
  });

  it('prices the generation with the default image model once it loads', async () => {
    findAllPages.mockResolvedValue(imageModels);
    const { result } = renderModal();

    await waitFor(() => expect(result.current._modelCost).toBe(5));
  });

  it('has the cached default model at once when the modal is reopened', async () => {
    const client = createTestQueryClient();
    findAllPages.mockResolvedValue(imageModels);
    const first = renderModal(client);
    await waitFor(() => expect(first.result.current._modelCost).toBe(5));
    first.unmount();

    findAllPages.mockReturnValue(new Promise(() => {}));
    const { result } = renderModal(client);

    expect(result.current._modelCost).toBe(5);
  });

  it('reads no models while the modal is closed', () => {
    const { result } = renderModal(createTestQueryClient(), false);

    expect(result.current._modelCost).toBe(0);
    expect(findAllPages).not.toHaveBeenCalled();
  });
});
