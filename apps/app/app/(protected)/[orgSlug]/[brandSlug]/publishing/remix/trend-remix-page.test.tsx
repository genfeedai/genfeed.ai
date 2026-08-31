import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  generateSourceVariations: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    generateSourceVariations: mocks.generateSourceVariations,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/moonrise-org/moonrise-studio${path}`,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useParams: () => ({
    brandSlug: 'moonrise-studio',
    orgSlug: 'moonrise-org',
  }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notifyError,
      success: mocks.notifySuccess,
      warning: mocks.notifyWarning,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

import TrendRemixPage from './trend-remix-page';

describe('TrendRemixPage', () => {
  beforeAll(() => {
    // Radix Select relies on pointer-capture and layout APIs jsdom omits.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams.forEach((_, key) => {
      mocks.searchParams.delete(key);
    });
    mocks.searchParams.set('platform', 'linkedin');
    mocks.searchParams.set('sourcePostId', 'source-post-1');
    mocks.generateSourceVariations.mockResolvedValue({
      meta: {
        actualCount: 2,
        creditCost: 2,
        groupId: 'group-12345678',
        partialReason: 'Generated 2 of 3: 1 duplicate.',
        requestedCount: 3,
        reviewBatchId: 'batch-12345678',
        sourceKind: 'source-post',
        voiceMode: 'organization-defaults',
        voiceModeLabel: 'Organization defaults (no brand voice configured)',
      },
      posts: [
        {
          description: 'First distinct variation',
          id: 'post-1',
          platform: 'linkedin',
        },
        {
          description: 'Second distinct variation',
          id: 'post-2',
          platform: 'linkedin',
        },
      ],
    });
  });

  it('defaults to three, previews per-output credits, and renders partial grouped results', async () => {
    const user = userEvent.setup();
    render(<TrendRemixPage />);

    expect(
      screen.getByText(/Estimated cost: 3 credits \(1 each\)/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Generate 3 variations' }),
    );

    await waitFor(() => {
      expect(mocks.generateSourceVariations).toHaveBeenCalledWith({
        count: 3,
        platform: 'linkedin',
        sourcePostId: 'source-post-1',
      });
    });
    expect(screen.getByText('2 of 3 variations ready')).toBeInTheDocument();
    expect(
      screen.getByText('Group group-12 · 2 credits charged'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Organization defaults (no brand voice configured)'),
    ).toBeInTheDocument();
    expect(screen.getByText('First distinct variation')).toBeInTheDocument();
    expect(screen.getByText('Second distinct variation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review all/ })).toHaveAttribute(
      'href',
      '/moonrise-org/moonrise-studio/publishing/review?batch=batch-12345678',
    );
    expect(mocks.notifyWarning).toHaveBeenCalledWith(
      'Generated 2 of 3: 1 duplicate.',
    );
  });

  it('shows the localized failure message instead of raw transport error text', async () => {
    const user = userEvent.setup();
    mocks.generateSourceVariations.mockRejectedValue(
      new Error('Request failed with status code 500'),
    );
    render(<TrendRemixPage />);

    await user.click(
      screen.getByRole('button', { name: 'Generate 3 variations' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Failed to generate post variations.',
      );
    });
    expect(mocks.notifyError).toHaveBeenCalledWith(
      'Failed to generate post variations.',
    );
    expect(
      screen.queryByText(/Request failed with status code 500/),
    ).not.toBeInTheDocument();
  });

  it('surfaces a validated, user-actionable server error detail', async () => {
    const user = userEvent.setup();
    mocks.generateSourceVariations.mockRejectedValue({
      errors: [
        {
          code: '400',
          detail: 'Platform linkedin cannot receive generated post variations.',
          title: 'Bad Request',
        },
      ],
    });
    render(<TrendRemixPage />);

    await user.click(
      screen.getByRole('button', { name: 'Generate 3 variations' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Platform linkedin cannot receive generated post variations.',
      );
    });
  });

  it('renders successful results without crashing when optional metadata is absent', async () => {
    const user = userEvent.setup();
    mocks.generateSourceVariations.mockResolvedValue({
      meta: {
        actualCount: 2,
        creditCost: 2,
        requestedCount: 2,
        sourceKind: 'source-post',
        voiceMode: 'brand-voice',
        voiceModeLabel: 'Brand voice',
      },
      posts: [
        {
          description: 'First distinct variation',
          id: 'post-1',
          platform: 'linkedin',
        },
        {
          description: 'Second distinct variation',
          id: 'post-2',
          platform: 'linkedin',
        },
      ],
    });
    render(<TrendRemixPage />);

    await user.click(
      screen.getByRole('button', { name: 'Generate 3 variations' }),
    );

    await waitFor(() => {
      expect(screen.getByText('2 of 2 variations ready')).toBeInTheDocument();
    });
    expect(screen.getByText('First distinct variation')).toBeInTheDocument();
    expect(screen.getByText('2 credits charged')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Review all/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Group /)).not.toBeInTheDocument();
    expect(screen.queryByText(/review batch/)).not.toBeInTheDocument();
    expect(mocks.notifyError).not.toHaveBeenCalled();
  });

  it('offers every count through ten and submits the selected boundary', async () => {
    const user = userEvent.setup();
    render(<TrendRemixPage />);

    await user.click(screen.getByRole('combobox', { name: 'Variation count' }));
    await user.click(
      await screen.findByRole('option', { name: '10 variations' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Generate 10 variations' }),
    );

    await waitFor(() => {
      expect(mocks.generateSourceVariations).toHaveBeenCalledWith(
        expect.objectContaining({ count: 10 }),
      );
    });
    expect(screen.getByText(/Estimated cost: 10 credits/)).toBeInTheDocument();
  });
});
