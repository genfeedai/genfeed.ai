import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RepliesWarmupTargets from './replies-warmup-targets';

const service = {
  addWarmupTarget: vi.fn(),
  discoverWarmupTargets: vi.fn(),
};

// Stable mocks: unstable ones would re-run effects on every render.
const translate = (key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => translate,
}));
const getService = () => Promise.resolve(service);
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() },
}));

const SUGGESTION = {
  engagement: 120,
  followersCount: 5400,
  matchedPosts: 3,
  samplePostId: 'p1',
  samplePostText: 'Shipping weekly beats shipping big.',
  username: 'target',
};

describe('RepliesWarmupTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.discoverWarmupTargets.mockResolvedValue([SUGGESTION]);
    service.addWarmupTarget.mockResolvedValue({
      botConfigId: 'bot-1',
      monitoredAccountId: 'acc-1',
      username: 'target',
    });
  });

  it('keeps search disabled until the niche is described', () => {
    render(<RepliesWarmupTargets brandId="brand-1" />);

    expect(screen.getByRole('button', { name: 'search' })).toBeDisabled();
  });

  it('searches the niche for the brand and lists suggestions', async () => {
    render(<RepliesWarmupTargets brandId="brand-1" />);

    fireEvent.change(screen.getByLabelText('queryLabel'), {
      target: { value: 'indie hackers' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'search' }));

    expect(await screen.findByText('@target')).toBeInTheDocument();
    expect(service.discoverWarmupTargets).toHaveBeenCalledWith({
      brandId: 'brand-1',
      query: 'indie hackers',
    });
  });

  it('monitors a suggestion once', async () => {
    render(<RepliesWarmupTargets brandId="brand-1" />);
    fireEvent.change(screen.getByLabelText('queryLabel'), {
      target: { value: 'indie hackers' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'search' }));
    fireEvent.click(await screen.findByRole('button', { name: 'monitor' }));

    await waitFor(() =>
      expect(service.addWarmupTarget).toHaveBeenCalledWith({
        brandId: 'brand-1',
        username: 'target',
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'monitoring' }),
    ).toBeDisabled();
  });
});
