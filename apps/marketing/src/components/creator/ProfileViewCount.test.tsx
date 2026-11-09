import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileViewCount from './ProfileViewCount';

const trackPublicView =
  vi.fn<
    (target: string, id: string, signal?: AbortSignal) => Promise<number | null>
  >();

vi.mock('@data/public-views', () => ({
  trackPublicView: (target: string, id: string, signal?: AbortSignal) =>
    trackPublicView(target, id, signal),
}));

beforeEach(() => {
  trackPublicView.mockReset();
});

describe('ProfileViewCount', () => {
  it('shows the view count once the visit is counted', async () => {
    trackPublicView.mockResolvedValue(1284);

    render(<ProfileViewCount brandId="brand-1" />);

    expect(await screen.findByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('views')).toBeInTheDocument();
  });

  it('shows nothing for a profile nobody has viewed yet', async () => {
    trackPublicView.mockResolvedValue(0);

    const { container } = render(<ProfileViewCount brandId="brand-1" />);

    await vi.waitFor(() => expect(trackPublicView).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when the count cannot be loaded', async () => {
    trackPublicView.mockRejectedValue(new Error('offline'));

    const { container } = render(<ProfileViewCount brandId="brand-1" />);

    await vi.waitFor(() => expect(trackPublicView).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
