import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrandAvatar } from './brand-avatar';

const OriginalImage = window.Image;

/** jsdom never loads images; this one loads or fails by the URL it is given. */
class FakeImage extends EventTarget {
  referrerPolicy = '';
  crossOrigin: string | null = null;
  complete = false;

  set src(url: string) {
    queueMicrotask(() => {
      this.dispatchEvent(new Event(url.includes('broken') ? 'error' : 'load'));
    });
  }
}

describe('BrandAvatar', () => {
  beforeEach(() => {
    window.Image = FakeImage as unknown as typeof window.Image;
  });

  afterEach(() => {
    window.Image = OriginalImage;
  });

  it('wears the same square, bordered frame with initials as with a logo', async () => {
    const { container, rerender } = render(<BrandAvatar name="Genfeed" />);
    const initialsFrame = container.firstElementChild;

    expect(screen.getByText('G')).toBeTruthy();
    expect(initialsFrame?.getAttribute('data-shape')).toBe('square');
    expect(initialsFrame?.classList.contains('outline-media')).toBe(true);

    rerender(<BrandAvatar alt="Genfeed" name="Genfeed" src="/logo.png" />);

    expect(await screen.findByRole('img', { name: 'Genfeed' })).toBeTruthy();
    const logoFrame = container.firstElementChild;
    expect(logoFrame?.getAttribute('data-shape')).toBe('square');
    expect(logoFrame?.classList.contains('outline-media')).toBe(true);
  });

  it('keeps the frame border when the logo fails to load', async () => {
    const { container } = render(
      <BrandAvatar name="Shayla" src="/broken.png" />,
    );

    await waitFor(() => expect(screen.getByText('S')).toBeTruthy());
    expect(
      container.firstElementChild?.classList.contains('outline-media'),
    ).toBe(true);
  });

  it('takes its size from the shared scale', () => {
    const { container } = render(<BrandAvatar name="Genfeed" size="3xl" />);

    expect(container.firstElementChild?.getAttribute('data-size')).toBe('3xl');
  });
});
