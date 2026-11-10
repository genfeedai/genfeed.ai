// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { ONBOARDING_CAMPAIGN_IMAGE_SLOTS } from '@genfeedai/contracts/constants';
import type {
  IOnboardingCampaignImage,
  IOnboardingFirstDraftsResult,
  IOnboardingScanResult,
} from '@genfeedai/contracts/interfaces';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FirstDraftsOnboarding from './first-drafts-onboarding';

const mocks = vi.hoisted(() => ({
  isCompleted: false,
  replace: vi.fn(),
  brandId: 'brand-1',
  isBrandScopeResolved: true,
  completeOnboarding: vi.fn(),
  email: 'owner@gmail.com',
  handleStepComplete: vi.fn(),
  readDrafts: vi.fn(),
  withdrawFeedback: vi.fn(),
  generateDrafts: vi.fn(),
  retryDraftMedia: vi.fn(),
  scanBrand: vi.fn(),
  rateFeedback: vi.fn(),
  listReadiness: vi.fn(),
  patchPost: vi.fn(),
  ensureFromPost: vi.fn(),
  scheduleTarget: vi.fn(),
  connectPlatform: vi.fn(),
  connectOptions: vi.fn(),
  search: new URLSearchParams(),
  steps: ['brand'] as string[],
  agentStatus: {
    connections: [] as Array<{ clientName: string | null }>,
    status: 'unconfigured' as 'configured' | 'error' | 'unconfigured',
  },
  creditBalance: 100 as number | null,
}));

vi.mock('@contexts/onboarding/onboarding-context', () => ({
  useOnboarding: () => ({
    handleStepComplete: mocks.handleStepComplete,
    steps: mocks.steps,
  }),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: mocks.brandId,
    isBrandScopeResolved: mocks.isBrandScopeResolved,
    organizationId: 'org-1',
  }),
}));
vi.mock('@app/(protected)/home/use-connect-genfeed-status', () => ({
  useConnectGenfeedStatus: () => mocks.agentStatus,
}));
vi.mock('./use-onboarding-credit-balance', () => ({
  useOnboardingCreditBalance: () => ({
    balance: mocks.creditBalance,
    isLoading: false,
  }),
}));
vi.mock('@hooks/navigation/use-org-url/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) => `/acme/~${path}`,
  }),
}));
vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: {
      email: mocks.email,
      id: 'user-1',
      isOnboardingCompleted: mocks.isCompleted,
    },
    isLoading: false,
  }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: () => Promise.resolve('token'),
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@services/onboarding/onboarding.service', () => ({
  OnboardingService: {
    getInstance: () => ({
      readDrafts: mocks.readDrafts,
      generateDrafts: mocks.generateDrafts,
      retryDraftMedia: mocks.retryDraftMedia,
      scanBrand: mocks.scanBrand,
    }),
  },
}));
vi.mock('@services/ai/branded-generation-receipts.service', () => ({
  BrandedGenerationReceiptsService: {
    getInstance: () => ({
      rateFeedback: mocks.rateFeedback,
      withdrawFeedback: mocks.withdrawFeedback,
    }),
  },
}));
vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => ({ listBrandPublishingReadiness: mocks.listReadiness }),
  },
}));
vi.mock('@services/content/posts.service', () => ({
  PostsService: { getInstance: () => ({ patch: mocks.patchPost }) },
}));
vi.mock('@services/content/release-groups.service', () => ({
  ReleaseGroupsService: {
    getInstance: () => ({
      ensureFromPost: mocks.ensureFromPost,
      scheduleTarget: mocks.scheduleTarget,
    }),
  },
}));
vi.mock(
  '@/hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect',
  () => ({
    usePlatformOAuthConnect: (options: unknown) => {
      mocks.connectOptions(options);
      return mocks.connectPlatform;
    },
  }),
);
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.search,
}));
vi.mock('../../_expert/use-complete-onboarding.hook', () => ({
  useCompleteOnboarding: () => mocks.completeOnboarding,
}));
vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => undefined,
}));
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img alt={alt} src={src} />
  ),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  const cache = new Map<string, ReturnType<typeof translateFromCatalog>>();
  return {
    useTranslations: (namespace: string) => {
      const translate = cache.get(namespace) ?? translateFromCatalog(namespace);
      cache.set(namespace, translate);
      return translate;
    },
  };
});

const SCANNED: IOnboardingScanResult = {
  status: 'scanned',
  summary: {
    name: 'Acme',
    suggestions: {
      audiences: ['Founders'],
      competitors: [],
      offers: ['A scheduling tool'],
    },
  },
};

function campaignImages(
  overrides: Partial<Record<string, IOnboardingCampaignImage['status']>> = {},
): IOnboardingCampaignImage[] {
  return ONBOARDING_CAMPAIGN_IMAGE_SLOTS.map((slot) => {
    const status = overrides[slot.id] ?? 'ready';
    return {
      aspectRatio: slot.aspectRatio,
      id: slot.id,
      ingredientId: status === 'ready' ? `ingredient-${slot.id}` : null,
      platform: slot.platform,
      status,
      url: status === 'ready' ? `https://cdn.example.com/${slot.id}.png` : null,
    };
  });
}

function drafts(
  status: IOnboardingFirstDraftsResult['status'] = 'ready',
): IOnboardingFirstDraftsResult {
  return {
    drafts: (['twitter', 'instagram', 'tiktok', 'linkedin'] as const).map(
      (platform) => ({
        isProvisional: false,
        platform,
        postId: `post-${platform}`,
        receiptId: `receipt-${platform}`,
        requestKey: `key-${platform}`,
        text: `${platform} draft text`,
      }),
    ),
    campaignImages: campaignImages(),
    imageIngredientId: 'ingredient-1',
    imageUrl: 'https://cdn.example.com/a.png',
    requestKey: 'key-twitter',
    status,
  };
}

async function startFromLink(link = 'acme.co') {
  const input = await screen.findByRole('textbox', {
    name: 'Website or social profile',
  });
  fireEvent.change(input, { target: { value: link } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit brand link' }));
}

async function goToChannels() {
  await screen.findByText('twitter draft text');
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('radio', { name: /Claude Code/ });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByTestId('connect-card-instagram');
}

async function goToPrompt() {
  await goToChannels();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'Now go to your agent' });
}

function savedRun() {
  return {
    id: 'run-1',
    mediaRetriesRemaining: 2,
    status: 'complete' as const,
    result: drafts(),
    verdicts: {},
  };
}

describe('FirstDraftsOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandId = 'brand-1';
    mocks.isCompleted = false;
    mocks.isBrandScopeResolved = true;
    mocks.email = 'owner@gmail.com';
    mocks.steps = ['brand'];
    mocks.search = new URLSearchParams();
    mocks.agentStatus = { connections: [], status: 'unconfigured' };
    mocks.creditBalance = 100;
    mocks.completeOnboarding.mockResolvedValue(undefined);
    mocks.handleStepComplete.mockResolvedValue(undefined);
    mocks.scanBrand.mockResolvedValue(SCANNED);
    mocks.generateDrafts.mockResolvedValue(drafts());
    mocks.readDrafts.mockResolvedValue(null);
    mocks.rateFeedback.mockResolvedValue({});
    mocks.withdrawFeedback.mockResolvedValue(undefined);
    mocks.listReadiness.mockResolvedValue([]);
    mocks.connectPlatform.mockResolvedValue(undefined);
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('prefills a company URL but waits for confirmation before generating', async () => {
    mocks.email = 'owner@acme.co';
    render(<FirstDraftsOnboarding />);
    expect(await screen.findByRole('textbox')).toHaveValue('https://acme.co');
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
    expect(mocks.scanBrand).not.toHaveBeenCalled();
  });

  it('submits a single-line brand link and shows the existing social preview cards', async () => {
    render(<FirstDraftsOnboarding />);
    await startFromLink();
    expect(await screen.findByText('twitter draft text')).toBeInTheDocument();
    expect(screen.getAllByTestId('preview-account-header')).toHaveLength(4);
    expect(
      screen.queryByRole('button', { name: /edit/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(mocks.generateDrafts).toHaveBeenCalledTimes(1);
    expect(mocks.scanBrand).toHaveBeenCalledWith(
      'brand-1',
      'acme.co',
      expect.any(AbortSignal),
    );
  });

  it('offers an optional account connection on the brand step without blocking the scan', async () => {
    render(<FirstDraftsOnboarding />);
    await screen.findByRole('textbox');
    expect(
      screen.getByRole('heading', { name: 'Connect your accounts (optional)' }),
    ).toBeInTheDocument();
    await screen.findByTestId('connect-card-instagram');
    for (const platform of ['tiktok', 'twitter', 'linkedin'])
      expect(
        screen.getByTestId(`connect-card-${platform}`),
      ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /youtube/i }),
    ).not.toBeInTheDocument();
    expect(mocks.connectOptions).toHaveBeenCalledWith({
      brandId: 'brand-1',
      returnTo: '/onboarding/brand',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Instagram' }));
    await waitFor(() =>
      expect(mocks.connectPlatform).toHaveBeenCalledWith('instagram'),
    );
    expect(mocks.scanBrand).not.toHaveBeenCalled();
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
  });

  it('shows an account connected before the scan as connected', async () => {
    mocks.listReadiness.mockResolvedValue([
      { providerKey: 'twitter', credentialId: 'cred-1', canSchedule: true },
    ]);
    render(<FirstDraftsOnboarding />);
    expect(
      await screen.findByRole('button', { name: 'X connected' }),
    ).toBeDisabled();
  });

  it('navigates through saved steps while completed generation stays disabled', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.textContent).toBe('');
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect your channels' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Connect Instagram' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect your agent' }));
    expect(
      await screen.findByRole('radio', { name: /Claude Code/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See your output' }));
    expect(screen.getByText('twitter draft text')).toBeInTheDocument();
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
    expect(mocks.scanBrand).not.toHaveBeenCalled();
  });

  it('replays the saved run for a finished user without leaving onboarding', async () => {
    mocks.isCompleted = true;
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    expect(await screen.findByText('twitter draft text')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
    expect(mocks.scanBrand).not.toHaveBeenCalled();
  });

  it('never starts a generation or scan when a finished user replays without a saved run', async () => {
    mocks.isCompleted = true;
    render(<FirstDraftsOnboarding />);
    await startFromLink();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You already finished onboarding',
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.readDrafts).toHaveBeenCalled();
    expect(mocks.scanBrand).not.toHaveBeenCalled();
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
  });

  it('disables future steps before any run exists', async () => {
    render(<FirstDraftsOnboarding />);
    await screen.findByRole('textbox');
    for (const name of [
      'Connect your agent',
      'Connect your channels',
      'Go to your agent',
    ])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
  });

  it('asks for a real web address instead of scanning a typo', async () => {
    render(<FirstDraftsOnboarding />);
    await startFromLink('na');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /doesn.t look like a web address/i,
    );
    expect(mocks.scanBrand).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'acme.co' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('normalizes an X handle before scanning', async () => {
    render(<FirstDraftsOnboarding />);
    await startFromLink('@acme');
    await screen.findByText('twitter draft text');
    expect(mocks.scanBrand).toHaveBeenCalledWith(
      'brand-1',
      'https://x.com/acme',
      expect.any(AbortSignal),
    );
  });

  it('restores saved server results and verdicts without another generation', async () => {
    mocks.readDrafts.mockResolvedValue({
      ...savedRun(),
      verdicts: { 'post-twitter': 'down' },
    });
    render(<FirstDraftsOnboarding />);
    expect(await screen.findByText('twitter draft text')).toBeInTheDocument();
    expect(
      screen
        .getByTestId('onboarding-draft-twitter')
        .querySelector('.opacity-35'),
    ).toBeInTheDocument();
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
    expect(mocks.scanBrand).not.toHaveBeenCalled();
  });

  it('shows a dimmed rejected preview and Undo withdraws the receipt feedback', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    fireEvent.click(
      within(screen.getByTestId('onboarding-draft-twitter')).getByRole(
        'button',
        { name: 'Not for me' },
      ),
    );
    await waitFor(() => expect(mocks.rateFeedback).toHaveBeenCalled());
    expect(
      screen
        .getByTestId('onboarding-draft-twitter')
        .querySelector('.opacity-35'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(mocks.withdrawFeedback).toHaveBeenCalledWith(
        'brand-1',
        'receipt-twitter',
      ),
    );
    expect(
      screen
        .getByTestId('onboarding-draft-twitter')
        .querySelector('.opacity-35'),
    ).not.toBeInTheDocument();
  });

  it('Back and forward reuse the same pieces of content', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('textbox');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('twitter draft text');
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
  });

  it('connects through logo cards and Back returns to the agent step without scheduling', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await goToChannels();
    for (const platform of ['instagram', 'tiktok', 'twitter', 'linkedin'])
      expect(
        screen.getByTestId(`connect-card-${platform}`).querySelector('svg'),
      ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect TikTok' }));
    await waitFor(() =>
      expect(mocks.connectPlatform).toHaveBeenCalledWith('tiktok'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(
      await screen.findByRole('radio', { name: /Claude Code/ }),
    ).toBeInTheDocument();
    expect(mocks.scheduleTarget).not.toHaveBeenCalled();
    expect(mocks.patchPost).not.toHaveBeenCalled();
  });

  it('finishes from the last step onto the drafts they just reviewed', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await goToChannels();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Now go to your agent' });
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() =>
      expect(mocks.completeOnboarding).toHaveBeenCalledWith({
        isLandingOnDrafts: true,
      }),
    );
  });

  it('shows existing connections without offering another connect', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    mocks.listReadiness.mockResolvedValue([
      { providerKey: 'instagram', credentialId: 'cred-1', canSchedule: true },
    ]);
    render(<FirstDraftsOnboarding />);
    await goToChannels();
    expect(
      await screen.findByRole('button', { name: 'Instagram connected' }),
    ).toBeDisabled();
  });

  it('shows the setup command for the chosen agent and waits for it to connect', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText(/claude mcp add --transport http genfeed/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Waiting for Claude Code to connect'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Codex/ }));
    expect(
      screen.getByText(/codex mcp add genfeed --url .*profile=studio/),
    ).toBeInTheDocument();
    expect(screen.getByText('Waiting for Codex to connect')).toBeVisible();
  });

  it('confirms the agent once it has made its first request', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    mocks.agentStatus = {
      connections: [{ clientName: 'Claude Code' }],
      status: 'configured',
    };
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Claude Code is connected')).toBeVisible();
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument();
  });

  it('lets the member skip the agent and the channels and still finish', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('radio', { name: /Claude Code/ });
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await screen.findByRole('button', { name: 'Connect Instagram' });
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await screen.findByRole('heading', { name: 'Now go to your agent' });
    expect(
      screen.queryByRole('button', { name: 'Skip for now' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalled());
  });

  it('gives a first prompt that names the brand and asks for no media from the Claude connector', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<FirstDraftsOnboarding />);
    await goToPrompt();
    const prompt =
      'Look at my Genfeed brand and this week’s trends. Draft three posts for Your brand and save them for my review. Do not publish them.';
    expect(screen.getByText(prompt)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy first prompt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(prompt));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
  });

  it('asks Codex for an image with each post and shows the credit balance', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    mocks.creditBalance = 100;
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await screen.findByRole('button', { name: 'Connect Instagram' });
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(
      await screen.findByText(/generate an image for each/),
    ).toBeInTheDocument();
    expect(screen.getByText('100 credits')).toBeInTheDocument();
    expect(screen.queryByText('Add credits')).not.toBeInTheDocument();
  });

  it('shows an empty balance with a way to add credits', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    mocks.creditBalance = 0;
    render(<FirstDraftsOnboarding />);
    await goToPrompt();
    expect(screen.getByText('0 credits')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add credits' })).toHaveAttribute(
      'href',
      '/acme/~/settings/credits',
    );
  });

  it('says so when the balance cannot be read', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    mocks.creditBalance = null;
    render(<FirstDraftsOnboarding />);
    await goToPrompt();
    expect(
      screen.getByText('Your balance isn’t available right now.'),
    ).toBeInTheDocument();
  });

  it('resumes the step a member left from', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    sessionStorage.setItem(
      'genfeed.onboarding.view.["user-1","org-1","brand-1"]',
      JSON.stringify({ phase: 'agent', url: 'acme.co' }),
    );
    render(<FirstDraftsOnboarding />);
    expect(
      await screen.findByRole('radio', { name: /Claude Code/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect your agent' }),
    ).toHaveAttribute('aria-current', 'step');
  });

  it('requires a skip confirmation and lets the user keep reviewing', async () => {
    render(<FirstDraftsOnboarding />);
    await screen.findByRole('textbox');
    fireEvent.click(screen.getByRole('button', { name: 'Skip onboarding' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'better content',
    );
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep reviewing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip onboarding' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Skip onboarding',
      }),
    );
    await waitFor(() =>
      expect(mocks.completeOnboarding).toHaveBeenCalledTimes(1),
    );
  });

  it('does not generate when recovery fails', async () => {
    mocks.readDrafts.mockRejectedValue(new Error('network'));
    render(<FirstDraftsOnboarding />);
    expect(await screen.findByRole('alert')).toHaveTextContent('recover');
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
    await startFromLink();
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
  });

  it('shows partial saved results while the same server run is working', async () => {
    mocks.readDrafts.mockResolvedValue({ ...savedRun(), status: 'running' });
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
  });

  it('preserves the useful text drafts when an image fails', async () => {
    const result = {
      ...drafts('partial'),
      imageUrl: null,
      imageIngredientId: null,
    };
    mocks.readDrafts.mockResolvedValue({ ...savedRun(), result });
    render(<FirstDraftsOnboarding />);
    expect(await screen.findByText('twitter draft text')).toBeInTheDocument();
    expect(
      screen.getByText('Image unavailable. Your text drafts are saved.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Some posts couldn’t be created. Your other drafts are saved.',
      ),
    ).not.toBeInTheDocument();
  });

  it('falls back to brand context when the public profile cannot be read', async () => {
    mocks.scanBrand.mockResolvedValue({ status: 'failed', reason: 'blocked' });
    render(<FirstDraftsOnboarding />);
    await startFromLink('https://instagram.com/acme');
    expect(
      await screen.findByText('Tell us what we missed'),
    ).toBeInTheDocument();
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
  });

  it('ignores a late recovery result after switching brands', async () => {
    let finish: (value: ReturnType<typeof savedRun>) => void = () => {};
    mocks.readDrafts.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(<FirstDraftsOnboarding />);
    await waitFor(() => expect(mocks.readDrafts).toHaveBeenCalled());
    mocks.brandId = 'brand-2';
    view.rerender(<FirstDraftsOnboarding />);
    await screen.findByRole('textbox');
    await act(async () => finish(savedRun()));
    expect(screen.queryByText('twitter draft text')).not.toBeInTheDocument();
  });
  it('restores server content even when browser storage is blocked', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
  });
  it('clears the OAuth return step when going back to drafts', async () => {
    mocks.search = new URLSearchParams('step=channels');
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await screen.findByTestId('connect-card-instagram');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('radio', { name: /Claude Code/ });
    expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand');
  });

  it('retries a missing campaign image without generating new drafts', async () => {
    const missing = {
      ...drafts('partial'),
      imageUrl: null,
      imageIngredientId: null,
    };
    mocks.readDrafts
      .mockResolvedValueOnce({ ...savedRun(), result: missing })
      .mockResolvedValue({ ...savedRun(), mediaRetriesRemaining: 1 });
    mocks.retryDraftMedia.mockResolvedValue(drafts());
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry media' })[0]);
    await waitFor(() => expect(mocks.retryDraftMedia).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.queryByText('Image unavailable. Your text drafts are saved.'),
      ).not.toBeInTheDocument(),
    );
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
  });

  it('shows the campaign image first and one image for each platform', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    expect(
      await screen.findByRole('img', { name: /Campaign image for/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Made from your campaign image'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('img', { name: 'Generated image for Instagram' }),
    ).toHaveLength(1);
    expect(
      screen.getByText(
        'Want this as video? Video is available with paid credits.',
      ),
    ).toBeInTheDocument();
  });

  it('says an image needs credits instead of calling it unavailable', async () => {
    mocks.readDrafts.mockResolvedValue({
      ...savedRun(),
      result: {
        ...drafts('partial'),
        campaignImages: campaignImages({
          instagram: 'needs_credits',
          linkedin: 'needs_credits',
        }),
      },
    });
    render(<FirstDraftsOnboarding />);
    expect(
      (await screen.findAllByText(/This image needs credits\./)).length,
    ).toBe(2);
    expect(
      screen.queryByText('Image unavailable. Your draft is saved.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry media' }),
    ).not.toBeInTheDocument();
  });

  it('offers no retry once the run has used them all', async () => {
    const missing = { ...drafts('partial'), imageUrl: null };
    mocks.readDrafts.mockResolvedValue({
      ...savedRun(),
      mediaRetriesRemaining: 0,
      result: missing,
    });
    render(<FirstDraftsOnboarding />);
    await screen.findByText('Image unavailable. Your text drafts are saved.');
    expect(
      screen.queryByRole('button', { name: 'Retry media' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the drafts and says so when the media retry fails', async () => {
    const missing = { ...drafts('partial'), imageUrl: null };
    mocks.readDrafts.mockResolvedValue({ ...savedRun(), result: missing });
    mocks.retryDraftMedia.mockRejectedValue(new Error('provider failed'));
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry media' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t create the media',
    );
    expect(screen.getByText('twitter draft text')).toBeInTheDocument();
  });
});
