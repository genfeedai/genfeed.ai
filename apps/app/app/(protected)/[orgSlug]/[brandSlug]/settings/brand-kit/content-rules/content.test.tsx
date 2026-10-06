import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandContentRulesPage from './content';

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
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

vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    brand: { id: 'brand-1', label: 'Acme' },
    brandId: 'brand-1',
    hasBrandId: true,
    isLoading: false,
  }),
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
vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
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

vi.mock('@ui/editors/LazyRichTextEditor', () => ({
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
    mocks.findForBrand.mockResolvedValue([]);
    mocks.accounts.mockResolvedValue([]);
  });

  it('renders the six harness tabs and defaults to Identity', async () => {
    render(<BrandContentRulesPage />);

    expect(await screen.findByText('Brand harness')).toBeInTheDocument();
    for (const label of [
      'Identity',
      'Structure',
      'Delivery',
      'Thesis',
      'Examples',
      'Learning',
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
    render(<BrandContentRulesPage />);

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

    render(<BrandContentRulesPage />);

    expect(
      await screen.findByText('Positioning scorecard'),
    ).toBeInTheDocument();
    expect(screen.getByText('Weakest: Origin story')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tell the story in five beats: where you were, the wall you hit, what you realized, what you did, and where you are now.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Learning' }));
    await screen.findByText('No connected accounts.');
    expect(screen.queryByText('Positioning scorecard')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Identity' }));
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

    render(<BrandContentRulesPage />);

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

    render(<BrandContentRulesPage />);

    await screen.findByLabelText('Label');
    fireEvent.click(screen.getByRole('button', { name: 'Save harness' }));

    await screen.findByRole('button', { name: 'Save harness' });
    expect(mocks.createForBrand).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', scope: 'brand' }),
    );
  });
  it('links the brand harness to scoped saved generation receipt inspection', async () => {
    render(<BrandContentRulesPage />);
    expect(
      await screen.findByRole('link', { name: 'Generation receipts' }),
    ).toHaveAttribute('href', '/acme/moonrise/settings/agent/receipts');
  });
  it('mounts Learning, hides profile actions and badges, and retains receipt navigation and draft', async () => {
    render(<BrandContentRulesPage />);
    await screen.findByLabelText('Label');
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Retained draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Learning' }));
    expect(
      await screen.findByText('No connected accounts.'),
    ).toBeInTheDocument();
    expect(mocks.accounts).toHaveBeenCalledWith(
      'brand-1',
      expect.any(AbortSignal),
    );
    expect(
      screen.queryByRole('button', { name: 'Save harness' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Promote winners to memory' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('scope: brand')).not.toBeInTheDocument();
    expect(screen.queryByText('Positioning scorecard')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Generation receipts' }),
    ).toBeInTheDocument();
    expect(mocks.createForBrand).not.toHaveBeenCalled();
    expect(mocks.promoteWinners).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Identity' }));
    expect(screen.getByLabelText('Label')).toHaveValue('Retained draft');
    expect(
      screen.getByRole('button', { name: 'Save harness' }),
    ).toBeInTheDocument();
  });
  it('preserves explicit winner promotion on profile tabs', async () => {
    mocks.promoteWinners.mockResolvedValue({ promoted: 2, skipped: 1 });
    render(<BrandContentRulesPage />);
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
});
