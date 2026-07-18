import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectRouteResolver from './connect-route-resolver';

const mocks = vi.hoisted(() => ({
  brands: [
    {
      organization: { slug: 'acme' },
      slug: 'main',
    },
  ] as Array<{
    organization: { slug: string };
    slug: string;
  }>,
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: mocks.brands,
    isReady: true,
    selectedBrand: undefined,
  }),
}));

vi.mock('@ui/loading/page/PageLoadingState', () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

describe('ConnectRouteResolver', () => {
  beforeEach(() => {
    mocks.brands = [
      {
        organization: { slug: 'acme' },
        slug: 'main',
      },
    ];
    mocks.replace.mockReset();
  });

  it('opens the organization-scoped Connect Genfeed route', async () => {
    render(<ConnectRouteResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/acme/~/connect');
    });
  });

  it('sends users without a workspace to onboarding', async () => {
    mocks.brands = [];

    render(<ConnectRouteResolver />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding');
    });
  });
});
