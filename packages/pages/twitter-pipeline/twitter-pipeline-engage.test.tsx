import type {
  ITwitterOpportunity,
  ITwitterSearchResult,
} from '@genfeedai/contracts/interfaces';
import TwitterPipelineEngage from '@pages/twitter-pipeline/twitter-pipeline-engage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  draft: vi.fn(),
  isReady: { value: true },
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  publish: vi.fn(),
  search: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: mocks.isReady.value,
    organizationId: 'org-123',
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token'),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notifyError,
      success: mocks.notifySuccess,
    }),
  },
}));

vi.mock('@services/twitter/twitter-pipeline.service', () => ({
  TwitterPipelineService: {
    getInstance: () => ({
      draft: mocks.draft,
      publish: mocks.publish,
      search: mocks.search,
    }),
  },
}));

const searchResults: ITwitterSearchResult[] = [
  {
    authorName: 'Ada',
    authorUsername: 'ada',
    id: 'tweet-1',
    likes: 1200,
    replies: 12,
    retweets: 300,
    text: 'AI content pipelines are the new CMS.',
  } as ITwitterSearchResult,
];

const opportunities: ITwitterOpportunity[] = [
  {
    reason: 'High engagement thread in your niche.',
    suggestedText: 'Strong take — the pipeline is the product.',
    targetAuthor: 'ada',
    targetTweet: 'AI content pipelines are the new CMS.',
    targetTweetId: 'tweet-1',
    type: 'reply',
  } as ITwitterOpportunity,
];

async function runSearch() {
  fireEvent.change(screen.getByLabelText('Search Query'), {
    target: { value: 'ai content' },
  });
  fireEvent.click(screen.getByRole('button', { name: /scan trends/i }));
  await screen.findByText('Trending Tweets (1)');
}

describe('TwitterPipelineEngage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isReady.value = true;
    mocks.search.mockResolvedValue(searchResults);
    mocks.draft.mockResolvedValue(opportunities);
    mocks.publish.mockResolvedValue({
      success: true,
      tweetUrl: 'https://x.com/me/status/9',
    });
  });

  it('renders the search form when the brand context is ready', () => {
    render(<TwitterPipelineEngage />);

    expect(
      screen.getByText('Find Engagement Opportunities'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Search Query')).toBeInTheDocument();
    expect(screen.getByLabelText('Your Twitter Handle')).toBeInTheDocument();
    expect(screen.getByLabelText('Voice Description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan trends/i })).toBeDisabled();
  });

  it('renders a loading state until the brand context is ready', () => {
    mocks.isReady.value = false;
    const { container } = render(<TwitterPipelineEngage />);

    expect(
      screen.queryByText('Find Engagement Opportunities'),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeInTheDocument();
  });

  it('searches with the voice config and renders trending tweets', async () => {
    render(<TwitterPipelineEngage />);

    fireEvent.change(screen.getByLabelText('Search Query'), {
      target: { value: 'ai content' },
    });
    fireEvent.change(screen.getByLabelText('Your Twitter Handle'), {
      target: { value: '@me' },
    });
    fireEvent.change(screen.getByLabelText('Voice Description'), {
      target: { value: 'friendly expert' },
    });
    fireEvent.keyDown(screen.getByLabelText('Search Query'), { key: 'Enter' });

    await screen.findByText('Trending Tweets (1)');
    expect(mocks.search).toHaveBeenCalledWith('org-123', 'brand-1', {
      description: 'friendly expert',
      handle: '@me',
      searchQuery: 'ai content',
    });
    expect(
      screen.getByText('AI content pipelines are the new CMS.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
  });

  it('shows the search error state and notifies', async () => {
    mocks.search.mockRejectedValue(new Error('rate limited'));
    render(<TwitterPipelineEngage />);

    fireEvent.change(screen.getByLabelText('Search Query'), {
      target: { value: 'ai content' },
    });
    fireEvent.click(screen.getByRole('button', { name: /scan trends/i }));

    await screen.findByText('rate limited');
    expect(mocks.notifyError).toHaveBeenCalledWith('Failed to search tweets');
  });

  it('drafts opportunities from the search results', async () => {
    render(<TwitterPipelineEngage />);
    await runSearch();

    fireEvent.click(screen.getByRole('button', { name: /draft with grok/i }));

    await screen.findByText('Draft Opportunities (1)');
    expect(mocks.draft).toHaveBeenCalledWith('org-123', searchResults, {
      description: '',
      handle: '',
      searchQuery: 'ai content',
    });
    expect(
      screen.getByDisplayValue('Strong take — the pipeline is the product.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('High engagement thread in your niche.'),
    ).toBeInTheDocument();
  });

  it('surfaces draft failures without dropping the results', async () => {
    mocks.draft.mockRejectedValue(new Error('grok offline'));
    render(<TwitterPipelineEngage />);
    await runSearch();

    fireEvent.click(screen.getByRole('button', { name: /draft with grok/i }));

    await screen.findByText('grok offline');
    expect(mocks.notifyError).toHaveBeenCalledWith('Failed to generate drafts');
    expect(screen.getByText('Trending Tweets (1)')).toBeInTheDocument();
  });

  it('publishes an opportunity and shows the published state', async () => {
    render(<TwitterPipelineEngage />);
    await runSearch();
    fireEvent.click(screen.getByRole('button', { name: /draft with grok/i }));
    await screen.findByText('Draft Opportunities (1)');

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await screen.findByText('Published successfully');
    expect(mocks.publish).toHaveBeenCalledWith('org-123', 'brand-1', {
      targetTweetId: 'tweet-1',
      text: 'Strong take — the pipeline is the product.',
      type: 'reply',
    });
    expect(mocks.notifySuccess).toHaveBeenCalledWith('Tweet published!');
    expect(screen.getByText('View tweet')).toBeInTheDocument();
  });

  it('notifies when publishing reports a failure', async () => {
    mocks.publish.mockResolvedValue({
      error: 'duplicate tweet',
      success: false,
    });
    render(<TwitterPipelineEngage />);
    await runSearch();
    fireEvent.click(screen.getByRole('button', { name: /draft with grok/i }));
    await screen.findByText('Draft Opportunities (1)');

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(mocks.notifyError).toHaveBeenCalledWith('duplicate tweet');
    });
    expect(
      screen.queryByText('Published successfully'),
    ).not.toBeInTheDocument();
  });

  it('resets the pipeline state', async () => {
    render(<TwitterPipelineEngage />);
    await runSearch();

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));

    expect(screen.queryByText('Trending Tweets (1)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search Query')).toHaveValue('');
  });
});
