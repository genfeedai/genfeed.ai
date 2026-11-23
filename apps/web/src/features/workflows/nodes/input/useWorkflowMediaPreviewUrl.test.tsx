import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowMediaConfig } from '@/features/workflows/nodes/input/media-picker';
import { useWorkflowMediaPreviewUrl } from './useWorkflowMediaPreviewUrl';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  query: { data: undefined as string | null | undefined, isError: false },
  useAuthedQuery: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-query/use-authed-query', () => ({
  useAuthedQuery: mocks.useAuthedQuery,
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: vi.fn() },
}));

const savedUrl = 'https://cdn.example/ingredients/videos/video-1';

function buildConfig(
  overrides: Partial<WorkflowMediaConfig> = {},
): WorkflowMediaConfig {
  return {
    dimensions: null,
    duration: null,
    itemCategory: 'video',
    itemId: 'video-1',
    label: null,
    mimeType: null,
    resolvedUrl: savedUrl,
    selectedResolvedUrl: savedUrl,
    source: 'library',
    thumbnailUrl: null,
    url: null,
    ...overrides,
  };
}

describe('useWorkflowMediaPreviewUrl', () => {
  beforeEach(() => {
    mocks.query.data = undefined;
    mocks.query.isError = false;
    mocks.useAuthedQuery.mockImplementation(() => mocks.query);
  });

  it('previews a Library video from the grant the API returns, not the saved URL', () => {
    mocks.query.data = 'https://grant.example/video-1?sig=1';

    const { result } = renderHook(() =>
      useWorkflowMediaPreviewUrl(buildConfig()),
    );

    expect(result.current).toBe('https://grant.example/video-1?sig=1');
  });

  it('shows nothing while the grant loads, so the saved URL is never requested', () => {
    const { result } = renderHook(() =>
      useWorkflowMediaPreviewUrl(buildConfig()),
    );

    expect(result.current).toBeNull();
  });

  it('falls back to the saved URL when the read fails', () => {
    mocks.query.isError = true;

    const { result } = renderHook(() =>
      useWorkflowMediaPreviewUrl(buildConfig()),
    );

    expect(result.current).toBe(savedUrl);
  });

  it('reads the ingredient through the service with its id', async () => {
    mocks.findOne.mockResolvedValue({
      ingredientUrl: 'https://grant.example/x',
    });
    renderHook(() => useWorkflowMediaPreviewUrl(buildConfig()));

    const options = mocks.useAuthedQuery.mock.calls[0][0] as {
      enabled: boolean;
      queryFn: (
        service: { findOne: typeof mocks.findOne },
        signal: AbortSignal,
      ) => Promise<string | null>;
    };
    const url = await options.queryFn(
      { findOne: mocks.findOne },
      new AbortController().signal,
    );

    expect(options.enabled).toBe(true);
    expect(url).toBe('https://grant.example/x');
    expect(mocks.findOne).toHaveBeenCalledWith(
      'video-1',
      {},
      expect.any(AbortSignal),
    );
  });

  it.each([
    ['a pasted URL', buildConfig({ source: 'url', itemId: null })],
    ['a brand reference', buildConfig({ itemCategory: 'reference' })],
  ])('previews %s from the saved URL', (_name, config) => {
    const { result } = renderHook(() => useWorkflowMediaPreviewUrl(config));

    expect(result.current).toBe(savedUrl);
    expect(
      (mocks.useAuthedQuery.mock.calls[0][0] as { enabled: boolean }).enabled,
    ).toBe(false);
  });
});
