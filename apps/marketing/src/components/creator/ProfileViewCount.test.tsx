import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileViewCount from './ProfileViewCount';

const trackAccountView =
  vi.fn<(brandId: string, signal?: AbortSignal) => Promise<number | null>>();

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => ({ trackAccountView }) },
}));

beforeEach(() => {
  trackAccountView.mockReset();
});

describe('ProfileViewCount', () => {
  it('shows the view count once the visit is counted', async () => {
    trackAccountView.mockResolvedValue(1284);

    render(<ProfileViewCount brandId="brand-1" />);

    expect(await screen.findByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('views')).toBeInTheDocument();
  });

  it('shows nothing for a profile nobody has viewed yet', async () => {
    trackAccountView.mockResolvedValue(0);

    const { container } = render(<ProfileViewCount brandId="brand-1" />);

    await vi.waitFor(() => expect(trackAccountView).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when the count cannot be loaded', async () => {
    trackAccountView.mockRejectedValue(new Error('offline'));

    const { container } = render(<ProfileViewCount brandId="brand-1" />);

    await vi.waitFor(() => expect(trackAccountView).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
