import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { redirect } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import OrgOverviewRedirectPage, * as PageModule from './page';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

runPageModuleTests('app/(protected)/[orgSlug]/~/overview/page', PageModule);

describe('OrgOverviewRedirectPage', () => {
  it('sends leftover /overview onto workspace overview', () => {
    expect(() => OrgOverviewRedirectPage()).toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith(APP_ROUTES.WORKSPACE.OVERVIEW);
  });
});
