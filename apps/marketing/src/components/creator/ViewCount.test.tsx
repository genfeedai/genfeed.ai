import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ViewCount from './ViewCount';

const trackView =
  vi.fn<
    (target: string, id: string, signal?: AbortSignal) => Promise<number | null>
  >();

vi.mock('@data/public-views', () => ({
  trackPublicView: (target: string, id: string, signal?: AbortSignal) =>
    trackView(target, id, signal),
}));

beforeEach(() => {
  trackView.mockReset();
});

describe('ViewCount', () => {
  it('shows the view count once the visit is counted', async () => {
    trackView.mockResolvedValue(1284);

    render(<ViewCount id="brand-1" target="profile" />);

    expect(await screen.findByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('views')).toBeInTheDocument();
  });

  it('shows nothing for a profile nobody has viewed yet', async () => {
    trackView.mockResolvedValue(0);

    const { container } = render(<ViewCount id="brand-1" target="profile" />);

    await vi.waitFor(() => expect(trackView).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when the count cannot be loaded', async () => {
    trackView.mockRejectedValue(new Error('offline'));

    const { container } = render(<ViewCount id="brand-1" target="profile" />);

    await vi.waitFor(() => expect(trackView).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
