import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PromptsPage from './prompts-page';

const mocks = vi.hoisted(() => {
  const findAll = vi.fn();

  return {
    error: vi.fn(),
    findAll,
    getService: vi.fn(async () => ({ findAll })),
    loggerError: vi.fn(),
    loggerInfo: vi.fn(),
    success: vi.fn(),
  };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmDeleteModal: () => ({ openConfirmDelete: vi.fn() }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

const notificationsServiceInstance = vi.hoisted(() => ({
  error: mocks.error,
  success: mocks.success,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => notificationsServiceInstance,
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content/prompts',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('PromptsPage shell-first loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the surface chrome immediately while prompts are loading', async () => {
    let resolveFindAll: (value: unknown[]) => void = () => undefined;
    mocks.findAll.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFindAll = resolve;
      }),
    );

    render(<PromptsPage />);

    expect(
      screen.getByRole('heading', { name: 'Saved Prompts' }),
    ).toBeVisible();
    expect(screen.getByTestId('content-prompts-surface')).toBeVisible();
    expect(screen.queryByText('No prompts found')).not.toBeInTheDocument();

    resolveFindAll([
      {
        id: 'prompt-1',
        label: 'Sample prompt',
        original: 'A sample prompt',
        status: 'draft',
      },
    ]);

    expect(await screen.findByText('Sample prompt')).toBeVisible();
  });

  it('shows the empty state inside the surface once loading resolves with no prompts', async () => {
    mocks.findAll.mockResolvedValueOnce([]);

    render(<PromptsPage />);

    await waitFor(() => {
      expect(screen.getByText('No prompts found')).toBeVisible();
    });
    expect(screen.getByTestId('content-prompts-surface')).toBeVisible();
  });
});
