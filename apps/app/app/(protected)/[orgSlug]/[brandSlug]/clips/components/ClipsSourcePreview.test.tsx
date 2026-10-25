import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipsSourcePreview from './ClipsSourcePreview';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('Clips source preview', () => {
  it('shows the source thumbnail and persisted transcript before loading a player', () => {
    const { container } = render(
      <ClipsSourcePreview
        name="Source title"
        sourceVideoUrl="https://youtu.be/dQw4w9WgXcQ"
        transcriptText="Actual transcript from this project."
      />,
    );
    expect(screen.getByRole('heading', { name: 'Source title' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Source title' })).toHaveAttribute(
      'src',
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
    expect(
      screen.getByText('Actual transcript from this project.'),
    ).toBeVisible();
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /play source video/i }));
    expect(container.querySelector('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(
      container.querySelector('iframe')?.getAttribute('src'),
    ).not.toContain('autoplay');
  });

  it('does not embed an arbitrary host or invent a transcript for a pending source', () => {
    const { container } = render(
      <ClipsSourcePreview sourceVideoUrl="https://attacker.test/youtube.com/watch?v=dQw4w9WgXcQ" />,
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /play source video/i }),
    ).toBeNull();
    expect(
      screen.getByText('The transcript will appear here after transcription.'),
    ).toBeVisible();
  });
});
