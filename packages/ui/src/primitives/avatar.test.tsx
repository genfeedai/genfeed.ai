import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Avatar } from './avatar';

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

describe('Avatar', () => {
  beforeEach(() => {
    window.Image = FakeImage as unknown as typeof window.Image;
  });

  afterEach(() => {
    window.Image = OriginalImage;
  });

  it('shows the picture once it has loaded', async () => {
    render(<Avatar alt="Ada Lovelace" name="Ada Lovelace" src="/ada.png" />);

    expect(
      await screen.findByRole('img', { name: 'Ada Lovelace' }),
    ).toBeTruthy();
    expect(screen.queryByText('AL')).toBeNull();
  });

  it('shows initials from the name when there is no picture', () => {
    render(<Avatar name="Ada Lovelace" />);

    expect(screen.getByText('AL')).toBeTruthy();
  });

  it('shows initials when the picture fails to load', async () => {
    render(<Avatar name="Genfeed" src="/broken.png" />);

    await waitFor(() => expect(screen.getByText('G')).toBeTruthy());
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows a question mark when there is nothing to take initials from', () => {
    render(<Avatar />);

    expect(screen.getByText('?')).toBeTruthy();
  });

  it('prefers a custom fallback over initials', () => {
    render(
      <Avatar fallback={<svg aria-label="platform logo" />} name="Genfeed" />,
    );

    expect(screen.getByLabelText('platform logo')).toBeTruthy();
    expect(screen.queryByText('G')).toBeNull();
  });

  it('tells the owner how the picture loaded and tries a fresh URL again', async () => {
    const onLoadingStatusChange = vi.fn();
    const { rerender } = render(
      <Avatar
        name="Genfeed"
        onLoadingStatusChange={onLoadingStatusChange}
        src="/broken.png?sig=old"
      />,
    );

    await waitFor(() =>
      expect(onLoadingStatusChange).toHaveBeenLastCalledWith('error'),
    );

    rerender(
      <Avatar
        alt="Genfeed"
        name="Genfeed"
        onLoadingStatusChange={onLoadingStatusChange}
        src="/logo.png?sig=new"
      />,
    );

    expect(await screen.findByRole('img', { name: 'Genfeed' })).toBeTruthy();
  });

  it('draws a badge on the corner and children over the picture', () => {
    render(
      <Avatar badge={<span>on X</span>} name="Genfeed">
        <button type="button">Upload</button>
      </Avatar>,
    );

    expect(screen.getByText('on X')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy();
  });
});
