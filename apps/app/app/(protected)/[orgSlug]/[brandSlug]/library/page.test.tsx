import { APP_ROUTES } from '@genfeedai/constants';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LibraryIndexPage from './page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('LibraryIndexPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends bare /library to the complete-path overview home', () => {
    LibraryIndexPage();

    expect(redirect).toHaveBeenCalledWith(APP_ROUTES.LIBRARY.OVERVIEW);
    expect(APP_ROUTES.LIBRARY.OVERVIEW).toBe('/library/overview');
  });
});
