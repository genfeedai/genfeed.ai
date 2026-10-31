import '@testing-library/jest-dom/vitest';
import { ViewType } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TurboProjectsPage from './TurboProjectsPage';

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
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: () => true,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock(
  '@/hooks/utils/use-collection-view-preference/use-collection-view-preference',
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
    leading,
    right,
  }: {
    children: ReactNode;
    leading?: ReactNode;
    right?: ReactNode;
  }) => (
    <main>
      {leading}
      {right}
      {children}
    </main>
  ),
}));

describe('TurboProjectsPage load recovery', () => {
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
    render(<TurboProjectsPage />);
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
      screen.queryByRole('link', { name: 'New project' }),
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
      detail: 'Turbo service temporarily unavailable',
    },
  ])(
    'preserves the reason and explicit recovery for $status $title',
    async (error) => {
      mocks.list.mockRejectedValueOnce({ errors: [error] });
      render(<TurboProjectsPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent(error.detail);
      expect(
        screen.queryByRole('link', { name: 'Manage subscription' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'New project' }),
      ).toBeInTheDocument();
      expect(mocks.list).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Retry loading' }),
        ).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
      await screen.findByText('Turn your brand into a week of content');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mocks.list).toHaveBeenCalledTimes(2);
      expect(mocks.list).toHaveBeenLastCalledWith(
        'brand-1',
        1,
        expect.any(AbortSignal),
        '',
      );
    },
  );

  it('retains an offline error without retrying automatically', async () => {
    mocks.list.mockRejectedValue(new Error('Network offline'));
    render(<TurboProjectsPage />);
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

  it('asks the server for the searched name and explains a search with no match', async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue([
      {
        id: 'project-1',
        itemCounts: { total: 3 },
        kind: 'image',
        name: 'Spring launch',
        status: 'draft',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
    ]);

    render(<TurboProjectsPage />);
    expect(await screen.findAllByText('Spring launch')).not.toHaveLength(0);

    mocks.list.mockResolvedValue([]);
    await user.type(
      screen.getByRole('textbox', { name: 'Search Turbo projects' }),
      'nothing like this{Enter}',
    );

    expect(
      await screen.findByText('No Turbo projects match your search.'),
    ).toBeVisible();
    expect(mocks.list).toHaveBeenLastCalledWith(
      'brand-1',
      1,
      expect.any(AbortSignal),
      'nothing like this',
    );
    expect(
      screen.queryByText('Turn your brand into a week of content'),
    ).not.toBeInTheDocument();
  });
});
