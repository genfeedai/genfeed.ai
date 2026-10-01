import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ImgHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationsPage from './generations-page';
import GenerationsLayout from './layout';

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, right }: PropsWithChildren<{ right?: ReactNode }>) => (
    <div>
      {right}
      {children}
    </div>
  ),
}));

vi.mock('@components/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({
    onClick,
    isRefreshing,
  }: {
    onClick: () => void;
    isRefreshing: boolean;
  }) => (
    <button
      onClick={onClick}
      type="button"
      aria-label="Refresh"
      data-loading={isRefreshing}
    >
      Refresh
    </button>
  ),
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    unoptimized,
  }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    // biome-ignore lint/performance/noImgElement: test stub for next/image
    <img
      alt={alt}
      data-unoptimized={unoptimized ? 'true' : 'false'}
      src={src}
    />
  ),
}));

const mocks = vi.hoisted(() => {
  const findAdminGenerationReviews = vi.fn();

  return {
    error: vi.fn(),
    findAdminGenerationReviews,
    getService: vi.fn(async () => ({ findAdminGenerationReviews })),
    loggerError: vi.fn(),
    searchParams: new URLSearchParams(),
  };
});

vi.mock('next-intl', () => {
  const copy: Record<string, string> = {
    compiled: 'Compiled',
    empty: 'No generations found',
    enhanced: 'Enhanced',
    loadError: 'Failed to load generation reviews',
    noImage: 'No image',
    original: 'Original',
    resultAlt: 'Generated result',
    retry: 'Try again',
    title: 'Generation reviews',
  };
  const translate = (key: string) => copy[key] ?? key;
  return { useTranslations: () => translate };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: vi.fn(),
  },
}));

const notificationsServiceInstance = vi.hoisted(() => ({
  error: mocks.error,
  success: vi.fn(),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => notificationsServiceInstance,
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content/generations',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}));

describe('GenerationsPage shell-first loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAdminGenerationReviews.mockResolvedValue([]);
    mocks.searchParams = new URLSearchParams();
  });

  it('renders the surface chrome immediately while generations are loading', async () => {
    let resolveFind: (value: unknown[]) => void = () => undefined;
    mocks.findAdminGenerationReviews.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFind = resolve;
      }),
    );

    render(<GenerationsPage />);

    expect(
      screen.getByRole('heading', { name: 'Generation reviews' }),
    ).toBeVisible();
    expect(screen.getByTestId('content-generations-surface')).toBeVisible();
    expect(screen.queryByText('No generations found')).not.toBeInTheDocument();

    resolveFind([
      {
        cdnUrl: 'https://cdn.genfeed.ai/ingredients/img.jpg',
        generationPrompt: 'compiled prompt',
        id: 'ingredient-1',
        modelUsed: 'google/nano-banana-2-lite',
        organization: { id: 'org-1', label: 'Acme' },
        prompt: {
          enhanced: 'enhanced prompt',
          original: 'original prompt',
        },
        status: 'GENERATED',
        user: { email: 'user@example.com', handle: 'user' },
      },
    ]);

    expect(await screen.findByText('original prompt')).toBeVisible();
    expect(screen.getByText('enhanced prompt')).toBeVisible();
    expect(screen.getByText('compiled prompt')).toBeVisible();
    expect(screen.getByText('google/nano-banana-2-lite')).toBeVisible();
    expect(screen.getByText(/user@example.com/)).toBeVisible();
    expect(screen.getByText(/Acme/)).toBeVisible();
    await waitFor(() => {
      expect(
        screen.getByRole('img', { name: 'original prompt' }),
      ).toBeVisible();
    });
  });

  it('refreshes the client request and keeps the indicator pending until completion', async () => {
    render(
      <GenerationsLayout>
        <GenerationsPage />
      </GenerationsLayout>,
    );
    await screen.findByText('No generations found');
    let finish: (value: unknown[]) => void = () => {};
    mocks.findAdminGenerationReviews.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(mocks.findAdminGenerationReviews).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute(
      'data-loading',
      'true',
    );
    finish([{ id: 'fresh', generationPrompt: 'Fresh generation' }]);
    expect(await screen.findByText('Fresh generation')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute(
      'data-loading',
      'false',
    );
  });

  it('hides stale page rows on failure and retries the current page', async () => {
    mocks.findAdminGenerationReviews.mockResolvedValueOnce([
      { id: 'old', generationPrompt: 'Old generation' },
    ]);
    const view = render(<GenerationsPage />);
    await screen.findByText('Old generation');
    mocks.findAdminGenerationReviews.mockRejectedValueOnce(
      new Error('Request failed'),
    );
    mocks.searchParams = new URLSearchParams('page=2');
    view.rerender(<GenerationsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load generation reviews',
    );
    expect(screen.queryByText('Old generation')).not.toBeInTheDocument();
    expect(screen.queryByText('No generations found')).not.toBeInTheDocument();
    mocks.findAdminGenerationReviews.mockResolvedValueOnce([
      { id: 'retry', generationPrompt: 'Retried generation' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Retried generation')).toBeVisible();
    expect(mocks.findAdminGenerationReviews).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.any(AbortSignal),
    );
  });
});
