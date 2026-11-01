// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type {
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
    expect(
      screen.getByRole('button', { name: /Create content/i }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Your brand/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Review drafts/i }));
    expect(screen.getByText('twitter draft text')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Connect accounts/i }));
    expect(
      await screen.findByRole('button', { name: 'Connect Instagram' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Review drafts/i }));
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
    expect(
      screen.getByRole('button', { name: /Create content/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Review drafts/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Connect accounts/i }),
    ).toBeDisabled();
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

  it('connects through logo cards and Back returns to review without scheduling', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByTestId('connect-card-instagram'),
    ).toBeInTheDocument();
    for (const platform of ['instagram', 'tiktok', 'twitter', 'linkedin'])
      expect(
        screen.getByTestId(`connect-card-${platform}`).querySelector('svg'),
      ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect TikTok' }));
    await waitFor(() =>
      expect(mocks.connectPlatform).toHaveBeenCalledWith('tiktok'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText('twitter draft text');
    expect(mocks.scheduleTarget).not.toHaveBeenCalled();
    expect(mocks.patchPost).not.toHaveBeenCalled();
  });

  it('finishes from the connect step onto the drafts they just reviewed', async () => {
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await screen.findByText('twitter draft text');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByTestId('connect-card-instagram');
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
    await screen.findByText('twitter draft text');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByRole('button', { name: 'Instagram connected' }),
    ).toBeDisabled();
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
    mocks.search = new URLSearchParams('step=schedule');
    mocks.readDrafts.mockResolvedValue(savedRun());
    render(<FirstDraftsOnboarding />);
    await screen.findByTestId('connect-card-instagram');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText('twitter draft text');
    expect(mocks.replace).toHaveBeenCalledWith('/onboarding/brand');
  });

  it('retries a missing image and video without generating new drafts', async () => {
    const missing = {
      ...drafts('partial'),
      imageUrl: null,
      imageIngredientId: null,
      videoStatus: 'failed' as const,
    };
    mocks.readDrafts
      .mockResolvedValueOnce({ ...savedRun(), result: missing })
      .mockResolvedValue({ ...savedRun(), mediaRetriesRemaining: 1 });
    mocks.retryDraftMedia.mockResolvedValue({
      ...drafts(),
      videoUrl: 'https://cdn.example.com/v.mp4',
      videoStatus: 'ready',
    });
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

  it('says the video needs credits instead of calling it unavailable', async () => {
    mocks.readDrafts.mockResolvedValue({
      ...savedRun(),
      result: {
        ...drafts('partial'),
        videoUrl: null,
        videoIngredientId: null,
        videoStatus: 'needs_credits' as const,
      },
    });
    render(<FirstDraftsOnboarding />);
    await screen.findByText(/Video needs credits\./);
    expect(screen.queryByText(/Video unavailable/)).not.toBeInTheDocument();
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
