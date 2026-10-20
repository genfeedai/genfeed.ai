// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type {
  IOnboardingFirstDraftsResult,
  IOnboardingScanResult,
} from '@genfeedai/contracts/interfaces';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
  generateDrafts: vi.fn(),
  scanBrand: vi.fn(),
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
      generateDrafts: mocks.generateDrafts,
      scanBrand: mocks.scanBrand,
    }),
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.search,
}));
vi.mock('../../_expert/use-complete-onboarding.hook', () => ({
  useCompleteOnboarding: () => mocks.completeOnboarding,
}));
vi.mock('next/image', () => ({
  // biome-ignore lint/performance/noImgElement: test double for next/image
  default: ({ alt, src }: { alt: string; src: string }) => (
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
    imageUrl: 'https://cdn.example.com/a.png',
    requestKey: 'key-twitter',
    status,
  };
}

async function startFromLink() {
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'acme.co' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Create my first posts' }),
  );
}

describe('FirstDraftsOnboarding', () => {
  beforeEach(() => {
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
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the four drafts right after a link, before anything else is asked', async () => {
    render(<FirstDraftsOnboarding />);
    await startFromLink();

    expect(await screen.findByText('twitter draft text')).toBeInTheDocument();
    expect(screen.getByText('instagram draft text')).toBeInTheDocument();
    expect(screen.getByText('tiktok draft text')).toBeInTheDocument();
    expect(screen.getByText('linkedin draft text')).toBeInTheDocument();
    expect(mocks.scanBrand).toHaveBeenCalledWith(
      'brand-1',
      'acme.co',
      expect.any(AbortSignal),
    );
    expect(mocks.generateDrafts).toHaveBeenCalledWith(
      'brand-1',
      {},
      expect.any(AbortSignal),
    );
  });

  it('waits for the brand instead of showing a dead form', () => {
    mocks.brandId = '';
    render(<FirstDraftsOnboarding />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Setting up your workspace'),
    ).toBeInTheDocument();
  });

  it('sends a finished user to the app without drafting', async () => {
    mocks.isCompleted = true;
    mocks.email = 'owner@acme.com';
    render(<FirstDraftsOnboarding />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'));
    expect(mocks.scanBrand).not.toHaveBeenCalled();
  });

  it('turns an @handle into an X profile link', async () => {
    render(<FirstDraftsOnboarding />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '@acme' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create my first posts' }),
    );

    await screen.findByText('twitter draft text');
    expect(mocks.scanBrand).toHaveBeenCalledWith(
      'brand-1',
      'https://x.com/acme',
      expect.any(AbortSignal),
    );
  });

  it('starts without asking when the work email gives a domain', async () => {
    mocks.email = 'owner@acme.com';
    render(<FirstDraftsOnboarding />);

    expect(await screen.findByText('twitter draft text')).toBeInTheDocument();
    expect(mocks.scanBrand).toHaveBeenCalledTimes(1);
  });

  it('finishes onboarding from "looks right" for a non-expert', async () => {
    render(<FirstDraftsOnboarding />);
    await startFromLink();
    await screen.findByText('twitter draft text');

    fireEvent.click(
      screen.getByRole('button', { name: 'Looks right, continue' }),
    );

    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalled());
    expect(mocks.handleStepComplete).not.toHaveBeenCalled();
  });

  it('continues the Expert path from the brand step', async () => {
    mocks.steps = ['brand', 'positioning', 'corpus'];
    render(<FirstDraftsOnboarding />);
    await startFromLink();
    await screen.findByText('twitter draft text');

    fireEvent.click(
      screen.getByRole('button', { name: 'Looks right, continue' }),
    );

    await waitFor(() =>
      expect(mocks.handleStepComplete).toHaveBeenCalledWith('brand'),
    );
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });

  it('asks for brand context only after "doesn\'t look right" and regenerates once', async () => {
    render(<FirstDraftsOnboarding />);
    await startFromLink();
    await screen.findByText('twitter draft text');

    fireEvent.click(
      screen.getByRole('button', { name: "This doesn't look right" }),
    );
    fireEvent.change(
      await screen.findByPlaceholderText('Founders who ship fast'),
      { target: { value: 'Indie founders' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Redo my posts' }));

    await waitFor(() => expect(mocks.generateDrafts).toHaveBeenCalledTimes(2));
    expect(mocks.generateDrafts).toHaveBeenLastCalledWith(
      'brand-1',
      {
        context: { audience: 'Indie founders', tone: 'keep' },
        previousRequestKey: 'key-twitter',
      },
      expect.any(AbortSignal),
    );
    // Round two is the last one: no third attempt is offered.
    await screen.findByText('Round 2 of 2');
    expect(
      screen.queryByRole('button', { name: "This doesn't look right" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Looks right, continue' }),
    ).toBeInTheDocument();
  });

  it('goes straight to the brand-context round when the link cannot be read', async () => {
    mocks.scanBrand.mockResolvedValue({ reason: 'blocked', status: 'failed' });
    render(<FirstDraftsOnboarding />);
    await startFromLink();

    expect(
      await screen.findByText(/couldn't read that link/),
    ).toBeInTheDocument();
    expect(mocks.generateDrafts).not.toHaveBeenCalled();
  });

  it('lets a user without a link describe the brand instead', async () => {
    render(<FirstDraftsOnboarding />);
    fireEvent.click(
      screen.getByRole('button', { name: "I don't have a link yet" }),
    );

    expect(
      await screen.findByText('Tell us what we missed'),
    ).toBeInTheDocument();
    expect(mocks.scanBrand).not.toHaveBeenCalled();
  });

  it('lets the user continue when nothing could be drafted', async () => {
    mocks.generateDrafts.mockResolvedValue({
      drafts: [],
      imageUrl: null,
      requestKey: null,
      status: 'unavailable',
    });
    render(<FirstDraftsOnboarding />);
    await startFromLink();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Continue to my workspace' }),
    );

    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: "This doesn't look right" }),
    ).not.toBeInTheDocument();
  });

  it('shows an error and keeps the link when drafting fails', async () => {
    mocks.generateDrafts.mockRejectedValue(new Error('boom'));
    render(<FirstDraftsOnboarding />);
    await startFromLink();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't draft your posts",
    );
    expect(screen.getByRole('textbox')).toHaveValue('acme.co');
  });
});
