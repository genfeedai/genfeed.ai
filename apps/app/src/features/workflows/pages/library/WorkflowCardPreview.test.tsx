import { metadata } from '@helpers/media/metadata/metadata.helper';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowCardPreview from './WorkflowCardPreview';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({
    src,
    ariaLabel,
    mediaProps,
    config,
  }: {
    src: string;
    ariaLabel: string;
    mediaProps: React.VideoHTMLAttributes<HTMLVideoElement>;
    config: { controls: boolean };
  }) => (
    <video
      aria-label={ariaLabel}
      src={src}
      {...mediaProps}
      controls={config.controls}
    >
      <track kind="captions" />
    </video>
  ),
}));

describe('WorkflowCardPreview', () => {
  it('uses the canonical CDN card once when no thumbnail is set', () => {
    render(<WorkflowCardPreview name="Daily digest" />);

    const image = screen.getByRole('img', { name: 'Default workflow card' });
    expect(image).toHaveAttribute('src', metadata.cards.default);
    expect(image.getAttribute('src')).toBe(
      'https://cdn.genfeed.ai/assets/cards/default.jpg',
    );
    expect(image.getAttribute('src') ?? '').not.toMatch(
      /cdn\.genfeed\.aihttps?:\/\//,
    );
  });

  it('falls back to the canonical card when the shared video preview fails', () => {
    render(
      <WorkflowCardPreview
        name="Daily digest"
        thumbnail="https://cdn.example.com/workflow.mp4"
      />,
    );
    const preview = screen.getByLabelText('Workflow preview');
    expect(preview).not.toHaveAttribute('controls');
    fireEvent.error(preview);
    expect(
      screen.getByRole('img', { name: 'Default workflow card' }),
    ).toHaveAttribute('src', metadata.cards.default);
  });

  it('keeps a supplied thumbnail URL as-is', () => {
    render(
      <WorkflowCardPreview
        name="Daily digest"
        thumbnail="https://cdn.genfeed.ai/assets/workflows/digest.jpg"
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Daily digest thumbnail' }),
    ).toHaveAttribute(
      'src',
      'https://cdn.genfeed.ai/assets/workflows/digest.jpg',
    );
  });
});
