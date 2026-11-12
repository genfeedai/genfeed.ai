import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ViewTracker from './ViewTracker';

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

describe('ViewTracker', () => {
  it('counts the visit without showing the count', async () => {
    trackView.mockResolvedValue(1284);

    const { container } = render(<ViewTracker id="brand-1" target="profile" />);

    await vi.waitFor(() =>
      expect(trackView).toHaveBeenCalledWith(
        'profile',
        'brand-1',
        expect.any(AbortSignal),
      ),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the visit cannot be counted', async () => {
    trackView.mockRejectedValue(new Error('offline'));

    const { container } = render(<ViewTracker id="brand-1" target="profile" />);

    await vi.waitFor(() => expect(trackView).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
