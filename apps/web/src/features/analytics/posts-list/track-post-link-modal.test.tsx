import TrackPostLinkModal from '@/features/analytics/posts-list/track-post-link-modal';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { trackLink, getService } = vi.hoisted(() => {
  const trackLink = vi.fn();
  return { trackLink, getService: vi.fn(async () => ({ trackLink })) };
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
const result = {
  postId: 'post-1',
  created: true,
  analyticsAvailability: 'eligible',
};

describe('TrackPostLinkModal', () => {
  beforeEach(() => {
    trackLink.mockReset();
    trackLink.mockResolvedValue(result);
  });
  it('opens a URL-only import form without success feedback or a provider request', () => {
    render(
      <TrackPostLinkModal
        brandId="brand-1"
        onClose={vi.fn()}
        onTracked={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('dialog', { name: 'Track a post' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Post link/)).toHaveAttribute('type', 'url');
    expect(screen.queryByLabelText('Title (optional)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import post' })).toBeDisabled();
    expect(trackLink).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'returns the created=%s result, so duplicate imports focus the existing post',
    async (created) => {
      const onTracked = vi.fn();
      const onClose = vi.fn();
      trackLink.mockResolvedValue({ ...result, created });
      render(
        <TrackPostLinkModal
          brandId="brand-1"
          onClose={onClose}
          onTracked={onTracked}
        />,
      );
      fireEvent.change(screen.getByLabelText(/Post link/), {
        target: { value: 'https://x.com/alice/status/123' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Import post' }));
      await waitFor(() =>
        expect(onTracked).toHaveBeenCalledWith({ ...result, created }),
      );
      expect(trackLink).toHaveBeenCalledWith({
        brandId: 'brand-1',
        url: 'https://x.com/alice/status/123',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps the form and input available after an import error', async () => {
    const onClose = vi.fn();
    const onTracked = vi.fn();
    trackLink.mockRejectedValue(
      new Error('Supported platforms are X, YouTube and LinkedIn'),
    );
    render(
      <TrackPostLinkModal
        brandId="brand-1"
        onClose={onClose}
        onTracked={onTracked}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Post link/), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import post' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Supported platforms',
    );
    expect(onTracked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Import post' })).toBeEnabled();
  });
  it('offers LinkedIn-only metadata and explains unknown article dates', async () => {
    render(
      <TrackPostLinkModal
        brandId="brand-1"
        onClose={vi.fn()}
        onTracked={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Post link/), {
      target: { value: 'https://linkedin.com/pulse/hello-alice' },
    });
    fireEvent.change(screen.getByLabelText('Title (optional)'), {
      target: { value: 'Original article' },
    });
    expect(
      screen.getByLabelText('Published date (optional)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/For articles, use the original date/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/LinkedIn metrics are unavailable/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import post' }));
    await waitFor(() =>
      expect(trackLink).toHaveBeenCalledWith({
        brandId: 'brand-1',
        url: 'https://linkedin.com/pulse/hello-alice',
        title: 'Original article',
      }),
    );
  });
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
