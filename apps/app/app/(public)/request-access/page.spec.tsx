import AppRequestAccessPage, * as PageModule from '@app/(public)/request-access/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { beforeEach, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

runPageModuleTests('app/(public)/request-access/page', PageModule);

describe('AppRequestAccessPage', () => {
  beforeEach(() => {
    mocks.redirect.mockClear();
  });

  it('redirects request-access traffic to the signup flow', () => {
    expect(() => AppRequestAccessPage()).toThrow(
      'NEXT_REDIRECT:/sign-up?source=request-access',
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      '/sign-up?source=request-access',
    );
  });
});
