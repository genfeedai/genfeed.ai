import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RepliesWarmupQueue from './replies-warmup-queue';

const service = {
  confirmReplyQueueItemPosted: vi.fn(),
  dismissReplyQueueItem: vi.fn(),
  findAwaitingApproval: vi.fn(),
  getReplyQueueUsage: vi.fn(),
  openReplyQueueItem: vi.fn(),
};

// next-intl and useAuthedService return stable functions; the component
// reloads when either changes, so the mocks must be stable too.
const translate = (key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;
vi.mock('next-intl', () => ({ useTranslations: () => translate }));
const getService = () => Promise.resolve(service);
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() },
}));

const USAGE = {
  awaiting: 1,
  dailyCap: 8,
  minGapMinutes: 10,
  nextAllowedAt: null,
  postedToday: 2,
  remainingToday: 6,
};
const DRAFT = {
  draftReplyText: 'Sharp take.',
  id: 'activity-1',
  triggerTweetAuthorUsername: 'target',
  triggerTweetText: 'Shipping weekly beats shipping big.',
};

describe('RepliesWarmupQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.findAwaitingApproval.mockResolvedValue({ data: [DRAFT], total: 1 });
    service.getReplyQueueUsage.mockResolvedValue(USAGE);
    vi.spyOn(window, 'open').mockReturnValue(null);
  });

  it('shows the drafted reply under the post it answers', async () => {
    render(<RepliesWarmupQueue />);

    expect(await screen.findByDisplayValue('Sharp take.')).toBeInTheDocument();
    expect(screen.getByText('@target')).toBeInTheDocument();
  });

  it('opens the edited draft in X and only counts it once confirmed', async () => {
    service.openReplyQueueItem.mockResolvedValue({
      intentUrl: 'https://x.com/intent/post?in_reply_to=1&text=Better',
      targetUrl: 'https://x.com/target/status/1',
    });
    service.confirmReplyQueueItemPosted.mockResolvedValue({
      ...USAGE,
      postedToday: 3,
    });
    render(<RepliesWarmupQueue />);

    fireEvent.change(await screen.findByDisplayValue('Sharp take.'), {
      target: { value: 'Better' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'openInX' }));

    await waitFor(() =>
      expect(service.openReplyQueueItem).toHaveBeenCalledWith(
        'activity-1',
        'Better',
      ),
    );
    expect(window.open).toHaveBeenCalledWith(
      'https://x.com/intent/post?in_reply_to=1&text=Better',
      '_blank',
      'noopener,noreferrer',
    );
    expect(service.confirmReplyQueueItemPosted).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'markPosted' }));

    await waitFor(() =>
      expect(service.confirmReplyQueueItemPosted).toHaveBeenCalledWith(
        'activity-1',
      ),
    );
    await waitFor(() =>
      expect(screen.queryByDisplayValue('Better')).not.toBeInTheDocument(),
    );
  });

  it('stops offering replies once the daily cap is used', async () => {
    service.getReplyQueueUsage.mockResolvedValue({
      ...USAGE,
      postedToday: 8,
      remainingToday: 0,
    });
    render(<RepliesWarmupQueue />);

    await screen.findByDisplayValue('Sharp take.');

    expect(screen.getByRole('button', { name: 'openInX' })).toBeDisabled();
  });

  it('dismisses a draft without opening X', async () => {
    service.dismissReplyQueueItem.mockResolvedValue(USAGE);
    render(<RepliesWarmupQueue />);

    fireEvent.click(await screen.findByRole('button', { name: 'dismiss' }));

    await waitFor(() =>
      expect(service.dismissReplyQueueItem).toHaveBeenCalledWith('activity-1'),
    );
    expect(window.open).not.toHaveBeenCalled();
  });
});
