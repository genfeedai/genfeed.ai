import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  eligibleStoryboardVoices,
  useStoryboardVoices,
} from './use-storyboard-voices';

const mocks = vi.hoisted(() => ({ userId: 'user-1', findAllPages: vi.fn() }));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ userId: mocks.userId }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const service = async () => ({ findAllPages: mocks.findAllPages });
  return { useAuthedService: () => service };
});
function voice(id: string, override: Partial<Ingredient> = {}) {
  return new Ingredient({
    id,
    category: IngredientCategory.VOICE,
    status: IngredientStatus.GENERATED,
    organizationId: 'org-1',
    brandId: 'brand-1',
    isDeleted: false,
    ...override,
  });
}
describe('saved Storyboard voice eligibility', () => {
  beforeEach(() => {
    mocks.findAllPages.mockReset();
    mocks.userId = 'user-1';
  });
  it('keeps real eligible current-brand/global rows and rejects foreign/deleted/catalog-only rows', () => {
    const eligible = [
      voice('uploaded', { status: IngredientStatus.UPLOADED }),
      voice('generated'),
      voice('validated', { status: IngredientStatus.VALIDATED }),
      voice('global', { brandId: null }),
    ];
    const invalid = [
      voice('foreign', { brandId: 'brand-2' }),
      voice('foreign-org', { organizationId: 'org-2' }),
      voice('deleted', { isDeleted: true }),
      voice('draft', { status: IngredientStatus.DRAFT }),
      voice('processing', { status: IngredientStatus.PROCESSING }),
      voice('failed', { status: IngredientStatus.FAILED }),
      voice('catalog-only', { organizationId: undefined, organization: '' }),
    ];
    expect(
      eligibleStoryboardVoices(
        [...eligible, ...invalid],
        'org-1',
        'brand-1',
      ).map((row) => row.id),
    ).toEqual(eligible.map((row) => row.id));
  });
  it('uses the real ingredients paginated read and ignores an old-organization response', async () => {
    let finish: (rows: Ingredient[]) => void = () => undefined;
    mocks.findAllPages
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce([voice('other', { organizationId: 'org-2' })]);
    const { result, rerender } = renderHook(
      ({ org }) => useStoryboardVoices('brand-1', org),
      { initialProps: { org: 'org-1' } },
    );
    await waitFor(() => expect(mocks.findAllPages).toHaveBeenCalledOnce());
    expect(mocks.findAllPages.mock.calls[0][0]).toMatchObject({
      category: IngredientCategory.VOICE,
      organizationId: 'org-1',
      isDeleted: false,
    });
    rerender({ org: 'org-2' });
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    await act(async () => {
      finish([voice('old')]);
    });
    expect(result.current.voices.map((row) => row.id)).toEqual(['other']);
  });
  it('distinguishes a failed load from an empty eligible list and retries', async () => {
    mocks.findAllPages
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce([]);
    const { result } = renderHook(() =>
      useStoryboardVoices('brand-1', 'org-1'),
    );
    await waitFor(() => expect(result.current.status).toBe('failed'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.voices).toEqual([]);
  });
});
