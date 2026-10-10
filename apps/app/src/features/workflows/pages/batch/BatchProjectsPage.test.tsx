import '@testing-library/jest-dom/vitest';
import { ViewType } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BatchProjectsPage from './BatchProjectsPage';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getService: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useLocale: () => 'en', useTranslations: translateFromCatalog };
});
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
    orgHref: (path: string) => `/acme/~${path}`,
  }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock(
  '@hooks/utils/use-collection-view-preference/use-collection-view-preference',
  () => ({
    useCollectionViewPreference: () => ({
      view: ViewType.LIST,
      setView: vi.fn(),
    }),
  }),
);
vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    right,
  }: {
    children: ReactNode;
    right?: ReactNode;
  }) => (
    <main>
      {right}
      {children}
    </main>
  ),
}));

describe('BatchProjectsPage load recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getService.mockResolvedValue({ list: mocks.list });
    mocks.list.mockResolvedValue([]);
  });

  it('shows a plan denial with organization billing navigation instead of a futile retry', async () => {
    mocks.list.mockRejectedValue({
      errors: [
        {
          status: '403',
          title: 'Active subscription required',
          detail:
            'An active subscription is required to use this feature. Please subscribe to a plan.',
        },
      ],
    });
    render(<BatchProjectsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An active subscription is required',
    );
    expect(
      screen.getByRole('link', { name: 'Manage subscription' }),
    ).toHaveAttribute('href', '/acme/~/settings/subscription');
    expect(
      screen.queryByRole('button', { name: 'Retry loading' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New batch' }),
    ).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Recent')).toBeNull();
    expect(screen.queryByText('All projects')).toBeNull();
  });

  it.each([
    { status: '403', title: 'Forbidden', detail: 'Brand access denied' },
    {
      status: '503',
      title: 'Unavailable',
      detail: 'Batch service temporarily unavailable',
    },
  ])(
    'preserves the reason and explicit recovery for $status $title',
    async (error) => {
      mocks.list.mockRejectedValueOnce({ errors: [error] });
      render(<BatchProjectsPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent(error.detail);
      expect(
        screen.queryByRole('link', { name: 'Manage subscription' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'New batch' }),
      ).toBeInTheDocument();
      expect(mocks.list).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Retry loading' }),
        ).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
      await screen.findByText('Create a saved batch from ideas or a workflow.');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mocks.list).toHaveBeenCalledTimes(2);
      expect(mocks.list).toHaveBeenLastCalledWith(
        'brand-1',
        1,
        expect.any(AbortSignal),
      );
    },
  );

  it('retains an offline error without retrying automatically', async () => {
    mocks.list.mockRejectedValue(new Error('Network offline'));
    render(<BatchProjectsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network offline',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Retry loading' }),
      ).toBeEnabled(),
    );
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
});
