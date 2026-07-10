import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import ProtectedRootPage, * as PageModule from './page';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@app/(protected)/root-resolver-client', () => ({
  default: () => <div data-testid="protected-root-resolver" />,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

runPageModuleTests('app/(protected)/page', PageModule);

describe('ProtectedRootPage', () => {
  const originalBetterAuthEnabled = process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
  const originalServerBetterAuthEnabled = process.env.BETTER_AUTH_ENABLED;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    delete process.env.BETTER_AUTH_ENABLED;
    mocks.redirect.mockClear();
  });

  afterEach(() => {
    if (originalBetterAuthEnabled === undefined) {
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = originalBetterAuthEnabled;
    }
    if (originalServerBetterAuthEnabled === undefined) {
      delete process.env.BETTER_AUTH_ENABLED;
    } else {
      process.env.BETTER_AUTH_ENABLED = originalServerBetterAuthEnabled;
    }
  });

  it('renders the protected root resolver', () => {
    render(<ProtectedRootPage />);

    expect(screen.getByTestId('protected-root-resolver')).toBeInTheDocument();
  });

  it('redirects keyless self-hosted root to the seeded workspace', () => {
    process.env.BETTER_AUTH_ENABLED = 'false';

    expect(() => ProtectedRootPage()).toThrow(
      'NEXT_REDIRECT:/default/default/workspace/overview',
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      '/default/default/workspace/overview',
    );
  });
});
