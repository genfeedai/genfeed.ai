import { render, screen, waitFor } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationsPage from './generations-page';

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
    title: 'Generation reviews',
  };
  return {
    useTranslations: () => (key: string) => copy[key] ?? key,
  };
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
  useSearchParams: () => new URLSearchParams(),
}));

describe('GenerationsPage shell-first loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
