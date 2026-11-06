// @vitest-environment jsdom

import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkflowRecentPrompts } from './useWorkflowRecentPrompts';

const mocks = vi.hoisted(() => {
  const findAll = vi.fn();
  return { findAll, getService: () => Promise.resolve({ findAll }) };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

function renderPrompts(isEnabled: boolean, client = createTestQueryClient()) {
  return renderHook(() => useWorkflowRecentPrompts(isEnabled), {
    wrapper: queryClientWrapper(client),
  });
}

describe('useWorkflowRecentPrompts', () => {
  beforeEach(() => {
    mocks.findAll.mockReset();
  });

  it('does not load until enabled', () => {
    const { result } = renderPrompts(false);

    expect(result.current.prompts).toEqual([]);
    expect(mocks.findAll).not.toHaveBeenCalled();
  });

  it('lists each distinct non-empty prompt once, newest first', async () => {
    mocks.findAll.mockResolvedValue([
      { id: '1', original: ' A neon alley ' },
      { id: '2', original: '' },
      { id: '3', original: 'A neon alley' },
      { id: '4', original: 'Studio product shot' },
    ]);

    const { result } = renderPrompts(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.prompts).toEqual([
      { id: '1', text: 'A neon alley' },
      { id: '4', text: 'Studio product shot' },
    ]);
  });

  it('reports an error when the request fails', async () => {
    mocks.findAll.mockRejectedValue(new Error('boom'));

    const { result } = renderPrompts(true);

    await waitFor(() => expect(result.current.hasError).toBe(true));
  });

  it('lists the cached prompts at once when the picker is reopened', async () => {
    mocks.findAll.mockResolvedValue([{ id: '1', original: 'A neon alley' }]);
    const client = createTestQueryClient();
    const firstOpen = renderPrompts(true, client);
    await waitFor(() =>
      expect(firstOpen.result.current.prompts).toHaveLength(1),
    );
    firstOpen.unmount();

    mocks.findAll.mockReturnValue(new Promise(() => {}));
    const { result } = renderPrompts(true, client);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.prompts).toEqual([{ id: '1', text: 'A neon alley' }]);
  });
});
