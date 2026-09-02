import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsIndexPage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  redirect: vi.fn(),
}));

describe('AnalyticsIndexPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends bare /analytics to the complete-path overview home', () => {
    AnalyticsIndexPage();

    expect(redirect).toHaveBeenCalledWith(APP_ROUTES.ANALYTICS.OVERVIEW);
    expect(APP_ROUTES.ANALYTICS.OVERVIEW).toBe('/analytics/overview');
  });
});
