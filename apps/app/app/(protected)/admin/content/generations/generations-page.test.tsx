import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ui/layout/admin-page-shell/AdminPageShell', () => ({
  default: ({
    children,
    download,
    dropdowns,
    filters,
    onRefresh,
    search,
    title,
  }: {
    children: ReactNode;
    download?: ReactNode;
    dropdowns?: ReactNode;
    filters?: ReactNode;
    onRefresh?: () => void;
    search?: ReactNode;
    title: string;
  }) => (
    <main>
      <div data-testid="subbar">
        <h1 className="sr-only">{title}</h1>
        {search}
        {filters}
        <button aria-label="Refresh" onClick={onRefresh} type="button">
          Refresh
        </button>
        {download}
        {dropdowns}
      </div>
      <div data-testid="content">{children}</div>
    </main>
  ),
}));

vi.mock('@ui/content/admin-filters/AdminOrgBrandUrlFilter', () => ({
  default: () => <div data-testid="org-filter" />,
  useAdminOrgBrandParams: () => ({
    brand: mocks.brand,
    organization: mocks.organization,
  }),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: ImgHTMLAttributes<HTMLImageElement>) => (
    // biome-ignore lint/performance/noImgElement: test stub for next/image
    <img alt={alt} src={src} />
  ),
}));

const mocks = vi.hoisted(() => ({
  brand: '',
  error: vi.fn(),
  notifications: { error: vi.fn(), success: vi.fn() },
  // Stable like the real hooks, so effects keyed on them do not loop.
  translate: (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${Object.values(values).join(' ')}` : key,
  findAdminGenerationReviews: vi.fn(),
  findAdminWithoutGeneration: vi.fn(),
  findModels: vi.fn(),
  loggerError: vi.fn(),
  organization: '',
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', async () => {
  const { useCallback } = await import('react');
  return {
    // A stable getter, like the real hook, so effects keyed on it do not loop.
    useAuthedService: (factory: (token: string) => unknown) =>
      useCallback(async () => factory('token'), []),
  };
});

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({
      findAdminGenerationReviews: mocks.findAdminGenerationReviews,
    }),
  },
}));
vi.mock('@services/content/prompts.service', () => ({
  PromptsService: {
    getInstance: () => ({
      findAdminWithoutGeneration: mocks.findAdminWithoutGeneration,
    }),
  },
}));
vi.mock('@services/ai/models.service', () => ({
  ModelsService: { getInstance: () => ({ findAll: mocks.findModels }) },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError, info: vi.fn() },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => mocks.notifications },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content/generations',
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));

import GenerationsPage from './generations-page';

const generation = {
  category: 'IMAGE',
  cdnUrl: 'https://cdn.genfeed.ai/ingredients/img.jpg',
  createdAt: '2026-10-18T07:25:00.000Z',
  generationCredits: 12,
  generationHarness: { brandMode: 'strict', status: 'applied' },
  generationPrompt: `Brand harness ${'x'.repeat(700)} compiled prompt`,
  id: 'ingredient-1',
  metadata: { height: 1080, width: 1920 },
  modelUsed: 'google/nano-banana-2-lite',
  organization: { id: 'org-1', label: 'Acme' },
  prompt: { enhanced: 'enhanced prompt', original: 'original prompt' },
  status: 'GENERATED',
  user: { email: 'user@example.com', handle: 'user' },
};

describe('admin Generations page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.organization = '';
    mocks.brand = '';
    mocks.findAdminGenerationReviews.mockResolvedValue([]);
    mocks.findAdminWithoutGeneration.mockResolvedValue([]);
    mocks.findModels.mockResolvedValue([
      { key: 'google/nano-banana-2-lite', label: 'Nano Banana 2 Lite' },
    ]);
  });

  it('puts every control in the subbar and draws no header in the content', async () => {
    render(<GenerationsPage />);
    await screen.findByText('empty');

    const subbar = within(screen.getByTestId('subbar'));
    expect(subbar.getByLabelText('search')).toBeInTheDocument();
    expect(subbar.getByLabelText('filterStatus')).toBeInTheDocument();
    expect(subbar.getByLabelText('filterType')).toBeInTheDocument();
    expect(subbar.getByLabelText('filterModel')).toBeInTheDocument();
    expect(subbar.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(subbar.getByRole('button', { name: 'download' })).toBeDisabled();
    expect(subbar.getByTestId('org-filter')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('content')).queryByRole('heading', {
        name: 'title',
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('lists a generation as a row: status badge, model, owner, cost, prompt', async () => {
    mocks.findAdminGenerationReviews.mockResolvedValueOnce([generation]);
    render(<GenerationsPage />);

    const row = await screen.findByRole('button', {
      name: 'open ingredient-1',
    });
    expect(within(row).getByText('Generated')).toBeVisible();
    expect(within(row).getByText('google/nano-banana-2-lite')).toBeVisible();
    expect(within(row).getByText(/user@example.com/)).toBeVisible();
    expect(within(row).getByText(/Acme/)).toBeVisible();
    expect(within(row).getByText('credits 12')).toBeVisible();
    expect(within(row).getByText('original prompt')).toBeVisible();
    expect(within(row).getByTestId('generation-thumbnail')).toHaveStyle({
      aspectRatio: String(1920 / 1080),
    });
  });

  it('opens the detail sheet with the prompts, harness and a collapsed long compiled prompt', async () => {
    mocks.findAdminGenerationReviews.mockResolvedValueOnce([generation]);
    render(<GenerationsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'open ingredient-1' }),
    );

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('original prompt')).toBeVisible();
    expect(within(sheet).getByText('enhanced prompt')).toBeVisible();
    expect(within(sheet).getByText('Brand mode: strict')).toBeVisible();
    expect(
      within(sheet).queryByText(/compiled prompt$/),
    ).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'show' }));
    expect(await within(sheet).findByText(/compiled prompt$/)).toBeVisible();
  });

  it('shows why a failed generation failed inside the sheet', async () => {
    mocks.findAdminGenerationReviews.mockResolvedValueOnce([
      {
        ...generation,
        generationError: 'provider timed out',
        status: 'FAILED',
      },
    ]);
    render(<GenerationsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'open ingredient-1' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'provider timed out',
    );
  });

  it('sends the subbar filters and the organization to the API', async () => {
    mocks.searchParams = new URLSearchParams(
      'status=FAILED&type=VIDEO&model=veo&q=cat&page=2',
    );
    mocks.organization = 'org-1';
    mocks.brand = 'brand-1';
    render(<GenerationsPage />);

    await waitFor(() =>
      expect(mocks.findAdminGenerationReviews).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          category: 'VIDEO',
          model: 'veo',
          organizationId: 'org-1',
          page: 2,
          search: 'cat',
          status: 'FAILED',
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('lists prompts that never produced a generation as placeholder rows', async () => {
    mocks.searchParams = new URLSearchParams('type=prompt');
    mocks.findAdminWithoutGeneration.mockResolvedValueOnce([
      {
        id: 'prompt-1',
        organization: { label: 'Acme' },
        original: 'a lone prompt',
        status: 'DRAFT',
        user: { email: 'user@example.com' },
      },
    ]);
    render(<GenerationsPage />);

    const row = await screen.findByRole('button', { name: 'open prompt-1' });
    expect(within(row).getByText('a lone prompt')).toBeVisible();
    expect(within(row).getByLabelText('noMedia')).toBeInTheDocument();
    expect(mocks.findAdminGenerationReviews).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('filterStatus')).not.toBeInTheDocument();
  });

  it('writes a filter change to the URL and resets the page', () => {
    mocks.searchParams = new URLSearchParams('page=3');
    render(<GenerationsPage />);
    // The dropdown is a Radix select; the search box is the simplest direct control.
    fireEvent.change(screen.getByLabelText('search'), {
      target: { value: 'sunset' },
    });
    fireEvent.keyDown(screen.getByLabelText('search'), { key: 'Enter' });

    return waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        '/admin/content/generations?q=sunset',
        { scroll: false },
      ),
    );
  });

  it('hides stale rows on failure and retries', async () => {
    mocks.findAdminGenerationReviews
      .mockResolvedValueOnce([generation])
      .mockRejectedValueOnce(new Error('Request failed'));
    const view = render(<GenerationsPage />);
    await screen.findByRole('button', { name: 'open ingredient-1' });

    mocks.searchParams = new URLSearchParams('page=2');
    view.rerender(<GenerationsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('loadError');
    expect(
      screen.queryByRole('button', { name: 'open ingredient-1' }),
    ).not.toBeInTheDocument();

    mocks.findAdminGenerationReviews.mockResolvedValueOnce([generation]);
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(
      await screen.findByRole('button', { name: 'open ingredient-1' }),
    ).toBeVisible();
  });

  it('downloads the displayed rows as CSV', async () => {
    mocks.findAdminGenerationReviews.mockResolvedValueOnce([generation]);
    const createObjectURL = vi.fn(() => 'blob:csv');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(<GenerationsPage />);
    await screen.findByRole('button', { name: 'open ingredient-1' });

    fireEvent.click(screen.getByRole('button', { name: 'download' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
