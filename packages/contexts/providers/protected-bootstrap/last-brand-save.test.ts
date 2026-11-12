import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClientProtectedBootstrapCache } from './client-protected-bootstrap';
import { resetLastBrandSave, saveLastBrand } from './last-brand-save';

vi.mock('./client-protected-bootstrap', () => ({
  clearClientProtectedBootstrapCache: vi.fn(),
}));

describe('saveLastBrand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    resetLastBrandSave();
  });

  it('sends one request when the switcher and the URL sync both save the same brand', async () => {
    const save = vi.fn().mockResolvedValue({});

    await Promise.all([
      saveLastBrand('brand_b', save),
      saveLastBrand('brand_b', save),
    ]);
    await saveLastBrand('brand_b', save);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('brand_b');
  });

  it('sends a request for each different brand, including switching back', async () => {
    const save = vi.fn().mockResolvedValue({});

    await saveLastBrand('brand_a', save);
    await saveLastBrand('brand_b', save);
    await saveLastBrand('brand_a', save);

    expect(save.mock.calls.map(([id]) => id)).toEqual([
      'brand_a',
      'brand_b',
      'brand_a',
    ]);
  });

  it('drops the shared bootstrap snapshot once the brand is saved', async () => {
    await saveLastBrand('brand_a', vi.fn().mockResolvedValue({}));

    expect(clearClientProtectedBootstrapCache).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed save', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({});

    await expect(saveLastBrand('brand_a', save)).rejects.toThrow('offline');
    await saveLastBrand('brand_a', save);

    expect(save).toHaveBeenCalledTimes(2);
  });

  it('saves again once the earlier save is no longer recent', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue({});

    await saveLastBrand('brand_a', save);
    await vi.advanceTimersByTimeAsync(11_000);
    await saveLastBrand('brand_a', save);

    expect(save).toHaveBeenCalledTimes(2);
  });
});
