import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadClientProtectedBootstrap } from './client-protected-bootstrap';
import { resetLastBrandSave, saveLastBrand } from './last-brand-save';

function createRecordingSave(failures = 0) {
  const savedBrandIds: string[] = [];
  let remainingFailures = failures;

  return {
    save: async (brandId: string): Promise<void> => {
      savedBrandIds.push(brandId);
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error('offline');
      }
    },
    savedBrandIds,
  };
}

describe('saveLastBrand', () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetLastBrandSave();
  });

  it('sends one request when the switcher and the URL sync both save the same brand', async () => {
    const { save, savedBrandIds } = createRecordingSave();

    await Promise.all([
      saveLastBrand('brand_b', save),
      saveLastBrand('brand_b', save),
    ]);
    await saveLastBrand('brand_b', save);

    expect(savedBrandIds).toEqual(['brand_b']);
  });

  it('sends a request for each different brand, including switching back', async () => {
    const { save, savedBrandIds } = createRecordingSave();

    await saveLastBrand('brand_a', save);
    await saveLastBrand('brand_b', save);
    await saveLastBrand('brand_a', save);

    expect(savedBrandIds).toEqual(['brand_a', 'brand_b', 'brand_a']);
  });

  it('retries after a failed save', async () => {
    const { save, savedBrandIds } = createRecordingSave(1);

    await expect(saveLastBrand('brand_a', save)).rejects.toThrow('offline');
    await saveLastBrand('brand_a', save);

    expect(savedBrandIds).toEqual(['brand_a', 'brand_a']);
  });

  it('saves again once the earlier save is no longer recent', async () => {
    vi.useFakeTimers();
    const { save, savedBrandIds } = createRecordingSave();

    await saveLastBrand('brand_a', save);
    await vi.advanceTimersByTimeAsync(11_000);
    await saveLastBrand('brand_a', save);

    expect(savedBrandIds).toEqual(['brand_a', 'brand_a']);
  });

  it('drops the shared workspace snapshot once the brand is saved', async () => {
    const requestedBy: string[] = [];
    const getAuthService = async () => ({
      getBootstrap: async () => {
        requestedBy.push('bootstrap');
        return {
          access: { brandId: 'brand_a', organizationId: 'org_1' },
          brands: [],
          currentUser: null,
          fleetCapabilities: null,
          settings: null,
          streak: null,
        };
      },
    });
    const loadBootstrap = () =>
      loadClientProtectedBootstrap(
        'protected-bootstrap:user_1:org_1',
        getAuthService as never,
      );

    await loadBootstrap();
    await loadBootstrap();
    await saveLastBrand('brand_b', async () => undefined);
    await loadBootstrap();

    expect(requestedBy).toEqual(['bootstrap', 'bootstrap']);
  });
});
