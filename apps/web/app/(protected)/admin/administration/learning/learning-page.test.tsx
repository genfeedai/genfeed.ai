import type { LearningPromptSlotOutcomeReport } from '@genfeedai/contracts/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LearningPage from './learning-page';

type ReportParams = { brandId?: string; organizationId: string };

const mocks = vi.hoisted(() => ({
  currentOrganizationId: 'org-own',
  requests: [] as { brandId?: string; organizationId: string }[],
  search: '',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/administration/learning',
  useRouter: () => ({
    replace: (url: string) => {
      mocks.search = url.split('?')[1] ?? '';
    },
  }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.currentOrganizationId }),
}));

vi.mock('@/components/content/admin-filters/AdminOrgBrandUrlFilter', () => ({
  default: () => <div>organization filter</div>,
  useAdminOrgBrandParams: () => {
    const params = new URLSearchParams(mocks.search);
    return {
      brand: params.get('brand') ?? '',
      organization: params.get('organization') ?? '',
    };
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getReport: async (params: ReportParams) => {
      mocks.requests.push(params);
      return report();
    },
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@ui/layout/admin-page-shell/AdminPageShell', () => ({
  default: ({
    children,
    dropdowns,
    title,
  }: {
    children: ReactNode;
    dropdowns?: ReactNode;
    title: string;
  }) => (
    <main>
      <h1>{title}</h1>
      {dropdowns}
      {children}
    </main>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  const translations = new Map<
    string,
    ReturnType<typeof translateFromCatalog>
  >();
  return {
    useTranslations: (namespace: string) => {
      if (!translations.has(namespace))
        translations.set(namespace, translateFromCatalog(namespace));
      return translations.get(namespace);
    },
  };
});

function report(): LearningPromptSlotOutcomeReport {
  return {
    groups: [
      {
        category: 'IMAGE',
        comparison: {
          alpha: 0.05,
          comparisonCount: 1,
          comparisons: [
            {
              difference: 0.7,
              filled: { count: 25, mean: 0.5 },
              lower: 0.4,
              rest: { count: 25, mean: -0.2 },
              slot: 'lighting',
              upper: 1,
              value: null,
              verdict: 'better',
            },
          ],
          excludedCount: 0,
          observationCount: 50,
        },
        objective: 'engagement',
        postCount: 50,
      },
    ],
    isPooled: false,
    isTruncated: false,
    organizationIds: ['org-1'],
    postCount: 50,
    skipped: { noPrompt: 0, noSlots: 0, noValidReward: 0 },
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={client}>
      <LearningPage />
    </QueryClientProvider>
  );
  const view = render(tree);
  // The page writes the default organization into the URL on mount; render
  // again so it reads that URL, as the router would.
  view.rerender(tree);
}

describe('LearningPage', () => {
  beforeEach(() => {
    mocks.currentOrganizationId = 'org-own';
    mocks.requests = [];
    mocks.search = '';
  });

  it('opens on the admin’s own organization and shows its report', async () => {
    renderPage();

    expect(await screen.findByText('lighting')).toBeVisible();
    expect(mocks.search).toBe('organization=org-own');
    expect(mocks.requests).toEqual([
      { brandId: undefined, organizationId: 'org-own' },
    ]);
  });

  it('reads the organization and brand picked in the URL', async () => {
    mocks.search = 'organization=org-picked&brand=brand-1';
    renderPage();

    expect(await screen.findByText('lighting')).toBeVisible();
    expect(mocks.search).toBe('organization=org-picked&brand=brand-1');
    expect(mocks.requests).toEqual([
      { brandId: 'brand-1', organizationId: 'org-picked' },
    ]);
  });

  it('asks for an organization when none is chosen yet', () => {
    mocks.currentOrganizationId = '';
    renderPage();

    expect(
      screen.getByText(
        'Choose an organization to see which prompt slots go with better or worse results.',
      ),
    ).toBeVisible();
    expect(screen.getByText('organization filter')).toBeVisible();
    expect(mocks.requests).toEqual([]);
  });
});
