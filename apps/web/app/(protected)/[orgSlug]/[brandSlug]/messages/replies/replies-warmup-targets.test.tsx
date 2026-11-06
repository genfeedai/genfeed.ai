import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RepliesWarmupTargets from './replies-warmup-targets';

const service = {
  addWarmupTarget: vi.fn(),
  discoverWarmupTargets: vi.fn(),
  listWarmupTargets: vi.fn(),
  removeWarmupTarget: vi.fn(),
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
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() },
}));

function render(ui: ReactElement, client = createTestQueryClient()) {
  return rtlRender(ui, { wrapper: queryClientWrapper(client) });
}

const PEER = {
  followersCount: 4200,
  isActive: true,
  monitoredAccountId: 'acc-9',
  username: 'peer',
};

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
    service.listWarmupTargets.mockResolvedValue([]);
    service.removeWarmupTarget.mockResolvedValue(undefined);
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

  it('lists the monitored accounts and removes one', async () => {
    service.listWarmupTargets.mockResolvedValue([PEER]);
    render(<RepliesWarmupTargets brandId="brand-1" />);

    expect(await screen.findByText('@peer')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'removeLabel {"username":"peer"}',
      }),
    );

    await waitFor(() => expect(screen.queryByText('@peer')).toBeNull());
    expect(service.removeWarmupTarget).toHaveBeenCalledWith({
      brandId: 'brand-1',
      monitoredAccountId: 'acc-9',
    });
    expect(screen.getByText('monitoredEmpty')).toBeInTheDocument();
  });

  it('shows an already monitored suggestion as monitoring', async () => {
    service.listWarmupTargets.mockResolvedValue([
      { isActive: true, monitoredAccountId: 'acc-1', username: 'Target' },
    ]);
    render(<RepliesWarmupTargets brandId="brand-1" />);
    await screen.findByText('@Target');
    fireEvent.change(screen.getByLabelText('queryLabel'), {
      target: { value: 'indie hackers' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'search' }));

    expect(
      await screen.findByRole('button', { name: 'monitoring' }),
    ).toBeDisabled();
  });

  it('lists the monitored accounts it already loaded at once when Replies is reopened', async () => {
    service.listWarmupTargets.mockResolvedValue([PEER]);
    const client = createTestQueryClient();
    const firstVisit = render(
      <RepliesWarmupTargets brandId="brand-1" />,
      client,
    );
    await screen.findByText('@peer');
    firstVisit.unmount();

    service.listWarmupTargets.mockReturnValue(new Promise(() => {}));
    render(<RepliesWarmupTargets brandId="brand-1" />, client);

    expect(screen.getByText('@peer')).toBeInTheDocument();
    expect(screen.queryByText('monitoredEmpty')).not.toBeInTheDocument();
  });

  it('never lists one brand monitored accounts under another brand', async () => {
    service.listWarmupTargets.mockResolvedValue([PEER]);
    const client = createTestQueryClient();
    const firstVisit = render(
      <RepliesWarmupTargets brandId="brand-1" />,
      client,
    );
    await screen.findByText('@peer');
    firstVisit.unmount();

    service.listWarmupTargets.mockReturnValue(new Promise(() => {}));
    render(<RepliesWarmupTargets brandId="brand-2" />, client);

    expect(screen.queryByText('@peer')).not.toBeInTheDocument();
  });
});
