import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      screen.getByText('Organization defaults (no brand voice configured)'),
    ).toBeInTheDocument();
    expect(screen.getByText('First distinct variation')).toBeInTheDocument();
    expect(screen.getByText('Second distinct variation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review all/ })).toHaveAttribute(
      'href',
      '/moonrise-org/moonrise-studio/publish/review?batch=batch-12345678',
    );
    expect(mocks.notifyWarning).toHaveBeenCalledWith(
      'Generated 2 of 3: 1 duplicate.',
    );
  });

  it('offers every count through ten and submits the selected boundary', async () => {
    const user = userEvent.setup();
    render(<TrendRemixPage />);

    await user.click(screen.getByRole('combobox', { name: 'Variation count' }));
    await user.click(screen.getByRole('option', { name: '10 variations' }));
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
