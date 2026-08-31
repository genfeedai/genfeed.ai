import '@testing-library/jest-dom/vitest';
import ContentRunListPage from '@pages/content-runs/list/content-run-list';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
  useBrandId: () => 'brand-1',
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ list }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/main${path}`,
  }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('./next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@services/content/content-runs.service', () => ({
  ContentRunsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

function renderContentRunList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ContentRunListPage />
    </QueryClientProvider>,
  );
}

describe('ContentRunListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links every run row to its brand-scoped detail page', async () => {
    list.mockResolvedValue([
      {
        id: 'run-1',
        brief: { angle: 'AI workflow proof' },
        createdAt: '2026-05-01T09:00:00.000Z',
        skillSlug: 'trend-remix',
        status: 'completed',
        variants: [{ id: 'variant-a' }],
      },
      {
        brief: { hypothesis: 'Turn the trend into a proof thread.' },
        id: 'run-2',
        publish: [{ variantId: 'variant-b' }],
        skillSlug: 'trend-remix',
        status: 'running',
      },
    ]);

    renderContentRunList();

    const firstRun = await screen.findByRole('link', {
      name: /AI workflow proof/,
    });

    expect(firstRun).toHaveAttribute(
      'href',
      '/acme/main/automation/content-runs/run-1',
    );
    expect(
      screen.getByRole('link', {
        name: /Turn the trend into a proof thread\./,
      }),
    ).toHaveAttribute('href', '/acme/main/automation/content-runs/run-2');
    expect(list).toHaveBeenCalledWith('brand-1', { status: undefined });
  });

  it('points the empty state back at Discovery, where content runs originate', async () => {
    list.mockResolvedValue([]);

    renderContentRunList();

    expect(await screen.findByText('No content runs yet')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to Discovery' }),
    ).toHaveAttribute('href', '/acme/main/discovery');
  });

  it('surfaces a retry affordance when the run list fails to load', async () => {
    list.mockRejectedValue(new Error('boom'));

    renderContentRunList();

    await waitFor(() => {
      expect(
        screen.getByText('Content runs could not be loaded.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
