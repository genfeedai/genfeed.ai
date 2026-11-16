import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandSettingsIndexPage from './page';

const redirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect }));

describe('BrandSettingsIndexPage', () => {
  beforeEach(() => {
    redirect.mockReset();
  });

  it('sends the bare brand settings address to the brand Profile page', async () => {
    await BrandSettingsIndexPage({
      params: Promise.resolve({ brandSlug: 'vincentshipsit', orgSlug: 'genfeedai' }),
    });

    expect(redirect).toHaveBeenCalledWith(
      '/genfeedai/vincentshipsit/settings/profile',
    );
  });
});
