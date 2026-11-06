import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandContentRulesPage from './content';

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  brandDetail: {
    brand: { id: 'brand-1', label: 'Acme' },
    brandId: 'brand-1',
    hasBrandId: true,
    isLoading: false,
  },
  control: vi.fn(),
  createForBrand: vi.fn(),
  findForBrand: vi.fn(),
  promoteWinners: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => mocks.brandDetail,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
    isReady: true,
    pageScope: 'brand',
  }),
}));
vi.mock('@/hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => 'owner',
}));
vi.mock('@genfeedai/services/analytics/content-learning.service', () => ({
  ContentLearningService: {
    getInstance: () => ({ accounts: mocks.accounts, control: mocks.control }),
  },
}));
vi.mock('@genfeedai/services/ai/harness-profiles.service', () => ({
  HarnessProfilesService: {
    getInstance: () => ({
      createForBrand: mocks.createForBrand,
      findForBrand: mocks.findForBrand,
      promoteWinners: mocks.promoteWinners,
      updateProfile: mocks.updateProfile,
    }),
  },
}));

const getHarnessService = async () => ({
  createForBrand: mocks.createForBrand,
  findForBrand: mocks.findForBrand,
  promoteWinners: mocks.promoteWinners,
  updateProfile: mocks.updateProfile,
});

const getLearningService = async () => ({
  accounts: mocks.accounts,
  control: mocks.control,
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  // Stable identity: the page's load effect depends on this getter.
  useAuthedService: (factory: (token: string) => unknown) => {
    const service = factory('test-token');
    return typeof service === 'object' &&
      service !== null &&
      'accounts' in service
      ? getLearningService
      : getHarnessService;
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/components/editors/LazyRichTextEditor', () => ({
  default: ({
    onChange,
    value,
  }: {
    onChange: (html: string) => void;
    value: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  ),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    headerTabs,
    label,
    right,
  }: {
    children: ReactNode;
    headerTabs: {
      activeTab: string;
      onTabChange: (tab: string) => void;
      tabs: Array<{ id: string; label: string }>;
    };
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      <nav>
        {headerTabs.tabs.map((tab) => (
          <button
            key={tab.id}
            aria-pressed={headerTabs.activeTab === tab.id}
            onClick={() => headerTabs.onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {right}
      {children}
    </section>
  ),
}));

describe('BrandContentRulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandDetail = {
      brand: { id: 'brand-1', label: 'Acme' },
      brandId: 'brand-1',
      hasBrandId: true,
      isLoading: false,
    };
    mocks.findForBrand.mockResolvedValue([]);
    mocks.accounts.mockResolvedValue([]);
  });

  it('renders the five content rule tabs and defaults to Identity', async () => {
    render(<BrandContentRulesPage />, { wrapper: queryClientWrapper() });

    await screen.findByLabelText('Label');
    expect(screen.queryByText('Brand harness')).not.toBeInTheDocument();
    for (const label of [
      'Identity',
      'Structure',
      'Delivery',
      'Thesis',
      'Examples',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Identity' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByLabelText('Label')).toBeInTheDocument();
  });

  it('switches tabs without losing edited draft state', async () => {
    render(<BrandContentRulesPage />, { wrapper: queryClientWrapper() });

    await screen.findByLabelText('Label');
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Founder Voice' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delivery' }));
    expect(await screen.findByLabelText('Tone')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Identity' }));
    expect(await screen.findByLabelText('Label')).toHaveValue('Founder Voice');
  });

  it('shows the positioning scorecard with the weakest dimension when the profile has been scored', async () => {
    mocks.findForBrand.mockResolvedValue([
      {
        id: 'profile-1',
        isDefault: true,
        label: 'Acme Harness',
        positioning: {
          dimensions: [
            {
              followUpFieldKey: 'originStory',
              followUpQuestion:
                'What was the moment you became the person you are now?',
              key: 'attractiveCharacter',
              label: 'Attractive character',
              maxWeightedScore: 20,
              score: 8,
              weight: 2,
              weightedScore: 16,
            },
            {
              followUpFieldKey: 'originStory',
              followUpQuestion:
                'Tell the story in five beats: where you were, the wall you hit, what you realized, what you did, and where you are now.',
              key: 'originStory',
              label: 'Origin story',
              maxWeightedScore: 15,
              score: 3,
              weight: 1.5,
              weightedScore: 4.5,
            },
          ],
          rating: 'needs_work',
          scoredAt: '2026-01-01T00:00:00.000Z',
          totalScore: 62,
          version: 1,
          weakestDimension: 'originStory',
        },
        status: 'active',
      },
    ]);

    render(<BrandContentRulesPage />, { wrapper: queryClientWrapper() });

    expect(
      await screen.findByText('Positioning scorecard'),
    ).toBeInTheDocument();
    expect(screen.getByText('Weakest: Origin story')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tell the story in five beats: where you were, the wall you hit, what you realized, what you did, and where you are now.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Positioning scorecard')).toBeInTheDocument();
  });

  it('hides the positioning scorecard when the profile has no positioning score', async () => {
    mocks.findForBrand.mockResolvedValue([
      {
        id: 'profile-1',
        isDefault: true,
        label: 'Acme Harness',
        status: 'active',
      },
    ]);

    render(<BrandContentRulesPage />, { wrapper: queryClientWrapper() });

    await screen.findByLabelText('Label');
    expect(screen.queryByText('Positioning scorecard')).not.toBeInTheDocument();
  });

  it('saves the draft through the harness profiles service', async () => {
    mocks.createForBrand.mockResolvedValue({
      id: 'profile-1',
      label: 'Acme Harness',
      profileType: 'harness',
      scope: 'brand',
      status: 'active',
    });

    render(<BrandContentRulesPage />, { wrapper: queryClientWrapper() });

    await screen.findByLabelText('Label');
    fireEvent.click(screen.getByRole('button', { name: 'Save content rules' }));

    await screen.findByRole('button', { name: 'Save content rules' });
    expect(mocks.createForBrand).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', scope: 'brand' }),
    );
  });
  it('links the brand harness to scoped saved generation receipt inspection', async () => {
    render(<BrandContentRulesPage />, { wrapper: queryClientWrapper() });
    expect(
      await screen.findByRole('link', { name: 'Generation receipts' }),
    ).toHaveAttribute('href', '/acme/moonrise/settings/agent/receipts');
  });
  it('preserves explicit winner promotion on profile tabs', async () => {
    mocks.promoteWinners.mockResolvedValue({ promoted: 2, skipped: 1 });
    render(<BrandContentRulesPage />, { wrapper: queryClientWrapper() });
    await screen.findByLabelText('Label');
    fireEvent.click(
      screen.getByRole('button', { name: 'Promote winners to memory' }),
    );
    await screen.findByRole('button', { name: 'Promote winners to memory' });
    expect(mocks.promoteWinners).toHaveBeenCalledWith({
      brandId: 'brand-1',
      limit: 10,
      platform: 'twitter',
    });
  });

  describe('cached content rules', () => {
    const acmeProfile = {
      id: 'profile-1',
      isDefault: true,
      label: 'Acme Founder Voice',
      status: 'active',
    };

    it('paints the cached rules at once when coming back', async () => {
      mocks.findForBrand.mockResolvedValue([acmeProfile]);
      const client = createTestQueryClient();
      const firstVisit = render(<BrandContentRulesPage />, {
        wrapper: queryClientWrapper(client),
      });
      expect(await screen.findByLabelText('Label')).toHaveValue(
        'Acme Founder Voice',
      );
      firstVisit.unmount();

      mocks.findForBrand.mockReturnValue(new Promise(() => {}));
      render(<BrandContentRulesPage />, {
        wrapper: queryClientWrapper(client),
      });

      expect(screen.getByLabelText('Label')).toHaveValue('Acme Founder Voice');
    });

    it('never shows one brand’s cached rules for another brand', async () => {
      mocks.findForBrand.mockResolvedValue([acmeProfile]);
      const client = createTestQueryClient();
      const firstVisit = render(<BrandContentRulesPage />, {
        wrapper: queryClientWrapper(client),
      });
      await screen.findByLabelText('Label');
      firstVisit.unmount();

      mocks.brandDetail = {
        brand: { id: 'brand-2', label: 'Moonrise' },
        brandId: 'brand-2',
        hasBrandId: true,
        isLoading: false,
      };
      mocks.findForBrand.mockReturnValue(new Promise(() => {}));
      render(<BrandContentRulesPage />, {
        wrapper: queryClientWrapper(client),
      });

      expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();
      expect(screen.queryByText('Acme Founder Voice')).not.toBeInTheDocument();
    });

    it('keeps what the user typed when a background refresh lands', async () => {
      mocks.findForBrand.mockResolvedValue([acmeProfile]);
      const client = createTestQueryClient();
      render(<BrandContentRulesPage />, {
        wrapper: queryClientWrapper(client),
      });
      await screen.findByLabelText('Label');
      fireEvent.change(screen.getByLabelText('Label'), {
        target: { value: 'Typed label' },
      });

      mocks.findForBrand.mockResolvedValue([
        { ...acmeProfile, label: 'Renamed elsewhere' },
      ]);
      await client.invalidateQueries({ queryKey: ['harness-profiles'] });

      await waitFor(() =>
        expect(screen.getByLabelText('Label')).toHaveValue('Typed label'),
      );
    });

    it('takes a background refresh into an untouched form', async () => {
      mocks.findForBrand.mockResolvedValue([acmeProfile]);
      const client = createTestQueryClient();
      render(<BrandContentRulesPage />, {
        wrapper: queryClientWrapper(client),
      });
      await screen.findByLabelText('Label');

      mocks.findForBrand.mockResolvedValue([
        { ...acmeProfile, label: 'Renamed elsewhere' },
      ]);
      await client.invalidateQueries({ queryKey: ['harness-profiles'] });

      await waitFor(() =>
        expect(screen.getByLabelText('Label')).toHaveValue('Renamed elsewhere'),
      );
    });
  });
});
