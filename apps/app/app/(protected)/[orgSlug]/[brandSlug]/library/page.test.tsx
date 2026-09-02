import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryIndexPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  redirect: vi.fn(),
}));

describe('LibraryIndexPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends bare /library to the All assets browser', () => {
    LibraryIndexPage();

    expect(redirect).toHaveBeenCalledWith(APP_ROUTES.LIBRARY.ASSETS);
    expect(APP_ROUTES.LIBRARY.ASSETS).toBe('/library/assets');
  });
});
