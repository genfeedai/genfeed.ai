import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type UseStudioBrandDefaultReferencesParams,
  useStudioBrandDefaultReferences,
} from '@/features/studio/playground/hooks/useStudioBrandDefaultReferences';

const mocks = vi.hoisted(() => {
  const service = { getDefaultReferences: vi.fn() };
  return {
    brandContext: { brandId: 'brand-a', organizationId: 'org-1' },
    getService: vi.fn(async () => service),
    identity: { sessionId: 'session-1', userId: 'user-1' },
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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    `${key}|${values?.name ?? ''}`,
}));

const defaults = [
  {
    assetId: 'style-1',
    label: 'Warm studio',
    role: 'style',
    url: 'https://cdn.example.test/style-1',
  },
  {
    assetId: 'product-1',
    role: 'product',
    url: 'https://cdn.example.test/product-1',
  },
];

const params: UseStudioBrandDefaultReferencesParams = {
  brandId: 'brand-a',
  hasOwnReferences: false,
  settings: { brandingMode: 'brand', modelKey: 'model-with-references' },
  type: 'image',
};

function render(
  overrides: Partial<UseStudioBrandDefaultReferencesParams> = {},
) {
  return renderHook(
    (props: UseStudioBrandDefaultReferencesParams) =>
      useStudioBrandDefaultReferences(props),
    {
      initialProps: { ...params, ...overrides },
      wrapper: queryClientWrapper(createTestQueryClient()),
    },
  );
}

describe('useStudioBrandDefaultReferences', () => {
  beforeEach(() => {
    mocks.service.getDefaultReferences.mockReset();
    mocks.service.getDefaultReferences.mockResolvedValue({
      references: defaults,
    });
  });

  it('shows the brand references as chips and sends nothing extra', async () => {
    const { result } = render();

    await waitFor(() => expect(result.current.assets).toHaveLength(2));
    expect(result.current.assets).toEqual([
      {
        id: 'style-1',
        kind: 'image',
        name: 'chip|Warm studio',
        previewUrl: 'https://cdn.example.test/style-1',
        role: 'reference',
        source: 'library',
      },
      {
        id: 'product-1',
        kind: 'image',
        name: 'chip|role.product|',
        previewUrl: 'https://cdn.example.test/product-1',
        role: 'reference',
        source: 'library',
      },
    ]);
    expect(result.current.request).toEqual({
      referenceIds: [],
      skipBrandReferences: false,
    });
  });

  it('sends the chips left as explicit references after one is removed', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.assets).toHaveLength(2));

    act(() => {
      result.current.dismiss('style-1');
    });

    expect(result.current.assets.map((asset) => asset.id)).toEqual([
      'product-1',
    ]);
    expect(result.current.request).toEqual({
      referenceIds: ['product-1'],
      skipBrandReferences: false,
    });
  });

  it('asks the server to add none once every chip is removed', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.assets).toHaveLength(2));

    act(() => {
      result.current.dismiss('style-1');
      result.current.dismiss('product-1');
    });

    expect(result.current.assets).toEqual([]);
    expect(result.current.request).toEqual({
      referenceIds: [],
      skipBrandReferences: true,
    });
  });

  it('ignores a chip that is not a brand default', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.assets).toHaveLength(2));

    let isDismissed = true;
    act(() => {
      isDismissed = result.current.dismiss('own-upload');
    });

    expect(isDismissed).toBe(false);
    expect(result.current.assets).toHaveLength(2);
  });

  it.each([
    [
      'branding is off',
      { settings: { brandingMode: 'off', modelKey: 'model-1' } },
    ],
    ['the user attached a reference', { hasOwnReferences: true }],
    [
      'the model is Auto',
      { settings: { brandingMode: 'brand', modelKey: 'auto' } },
    ],
    ['the asset is a video', { type: 'video' }],
  ] as const)('shows nothing when %s', async (_name, overrides) => {
    const { result } = render(overrides);

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.assets).toEqual([]);
    expect(result.current.request).toEqual({
      referenceIds: [],
      skipBrandReferences: false,
    });
    expect(mocks.service.getDefaultReferences).not.toHaveBeenCalled();
  });

  it('starts from every default again on another model', async () => {
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.assets).toHaveLength(2));
    act(() => {
      result.current.dismiss('style-1');
    });

    rerender({
      ...params,
      settings: { brandingMode: 'brand', modelKey: 'another-model' },
    });

    await waitFor(() => expect(result.current.assets).toHaveLength(2));
    expect(result.current.request.referenceIds).toEqual([]);
  });
});
