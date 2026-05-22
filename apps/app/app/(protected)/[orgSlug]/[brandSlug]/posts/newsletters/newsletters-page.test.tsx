import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewslettersPage from './newsletters-page';

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  archive: vi.fn(),
  error: vi.fn(),
  findAll: vi.fn(),
  generateDraft: vi.fn(),
  generateTopicProposals: vi.fn(),
  getContext: vi.fn(),
  loggerError: vi.fn(),
  patch: vi.fn(),
  publish: vi.fn(),
  push: vi.fn(),
  queryResult: {
    data: [] as unknown[],
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  refetch: vi.fn(),
  success: vi.fn(),
}));

const newsletters = [
  {
    angle: 'Operator lessons',
    content: 'Draft body',
    id: 'newsletter-1',
    label: 'Issue 1',
    status: 'ready_for_review',
    summary: 'Draft summary',
    topic: 'AI workflows',
  },
  {
    angle: 'Continuity',
    content: 'Published body',
    id: 'newsletter-2',
    label: 'Issue 2',
    status: 'published',
    summary: 'Published summary',
    topic: 'Content memory',
  },
];

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    selectedBrand: { label: 'Acme' },
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    approve: mocks.approve,
    archive: mocks.archive,
    findAll: mocks.findAll,
    generateDraft: mocks.generateDraft,
    generateTopicProposals: mocks.generateTopicProposals,
    getContext: mocks.getContext,
    patch: mocks.patch,
    publish: mocks.publish,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/main${path}`,
  }),
}));

vi.mock('@services/content/newsletters.service', () => ({
  NewslettersService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.error,
      success: mocks.success,
    }),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => mocks.queryResult),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'id' ? null : null),
  }),
}));

describe('NewslettersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryResult.data = newsletters;
    mocks.queryResult.error = null;
    mocks.queryResult.isLoading = false;
    mocks.queryResult.refetch = mocks.refetch;
    mocks.findAll.mockResolvedValue(newsletters);
    mocks.refetch.mockResolvedValue({ data: newsletters });
    mocks.generateTopicProposals.mockResolvedValue([
      {
        angle: 'A practical operating angle',
        reason: 'Strong continuity with prior issues',
        title: 'Ship with AI agents',
      },
    ]);
    mocks.generateDraft.mockResolvedValue({
      id: 'newsletter-1',
      label: 'Issue 1',
    });
    mocks.getContext.mockResolvedValue({
      contextSources: [
        {
          label: 'Brand voice',
          summary: 'Use direct, practical language.',
        },
      ],
      selectedContext: [
        {
          id: 'newsletter-2',
          label: 'Issue 2',
          status: 'published',
          summary: 'Published summary',
          topic: 'Content memory',
        },
      ],
      selectedContextIds: ['newsletter-2'],
    });
    mocks.patch.mockResolvedValue({ id: 'newsletter-1' });
    mocks.approve.mockResolvedValue({});
    mocks.publish.mockResolvedValue({});
    mocks.archive.mockResolvedValue({});
  });

  it('renders the brand-scoped newsletter workspace and filters archive items', () => {
    render(<NewslettersPage />);

    expect(screen.getByRole('heading', { name: 'Newsletters' })).toBeVisible();
    expect(
      screen.getByText(/Build history-aware newsletters for Acme/),
    ).toBeVisible();
    expect(screen.getByText('Issue 1')).toBeVisible();
    expect(screen.getAllByText('Issue 2').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText('Search newsletters'), {
      target: { value: 'memory' },
    });

    expect(screen.queryByText('Issue 1')).not.toBeInTheDocument();
    expect(screen.getAllByText('Issue 2').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText('No newsletters found')).toBeVisible();
  });

  it('generates proposals and creates a review draft with selected context', async () => {
    render(<NewslettersPage />);

    fireEvent.change(screen.getByLabelText('Editorial instructions'), {
      target: { value: 'Use a CTO operator tone' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Proposals' }));

    await waitFor(() => {
      expect(mocks.generateTopicProposals).toHaveBeenCalledWith({
        count: 5,
        instructions: 'Use a CTO operator tone',
      });
    });
    expect(screen.getByText('Ship with AI agents')).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate Review Draft' }),
    );

    await waitFor(() => {
      expect(mocks.generateDraft).toHaveBeenCalledWith({
        angle: 'A practical operating angle',
        contextNewsletterIds: ['newsletter-2'],
        instructions: 'Use a CTO operator tone',
        topic: 'Ship with AI agents',
      });
    });
    await waitFor(() => {
      expect(mocks.getContext).toHaveBeenCalledWith('newsletter-1');
    });
    expect(mocks.success).toHaveBeenCalledWith(
      'Newsletter draft ready for review',
    );
  });

  it('loads context, edits, saves, approves, publishes, and archives a newsletter', async () => {
    render(<NewslettersPage />);

    fireEvent.click(screen.getByRole('button', { name: /Issue 1/i }));

    await waitFor(() => {
      expect(mocks.getContext).toHaveBeenCalledWith('newsletter-1');
    });
    expect(await screen.findByText('Brand voice')).toBeVisible();

    fireEvent.change(screen.getByPlaceholderText('Newsletter label'), {
      target: { value: 'Issue 1 revised' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('newsletter-1', {
        angle: 'Operator lessons',
        content: 'Draft body',
        label: 'Issue 1 revised',
        summary: 'Draft summary',
        topic: 'AI workflows',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(mocks.approve).toHaveBeenCalledWith('newsletter-1');
      expect(mocks.publish).toHaveBeenCalledWith('newsletter-1');
      expect(mocks.archive).toHaveBeenCalledWith('newsletter-1');
    });
  });

  it('shows validation errors and routes empty-state actions to workflows', async () => {
    mocks.queryResult.data = [];

    render(<NewslettersPage />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate Review Draft' }),
    );
    expect(mocks.error).toHaveBeenCalledWith(
      'Select a proposal or enter a manual topic',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Workflows' }));
    expect(mocks.push).toHaveBeenCalledWith('/acme/main/workflows');
  });
});
