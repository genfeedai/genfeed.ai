import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReviewInboxPreview from './ReviewInboxPreview';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

describe('ReviewInboxPreview', () => {
  it('mounts no video until the reviewer asks for it', () => {
    const { container } = render(
      <ReviewInboxPreview
        preview={{ caption: 'Hello', mediaUrl: 'https://cdn.test/clip.mp4' }}
      />,
    );

    expect(container.querySelector('video')).toBeNull();

    fireEvent.click(screen.getByRole('button'));

    expect(container.querySelector('video')).not.toBeNull();
  });

  it('shows an image preview without a play button', () => {
    const { container } = render(
      <ReviewInboxPreview
        preview={{ caption: null, mediaUrl: 'https://cdn.test/photo.jpg' }}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });
});
