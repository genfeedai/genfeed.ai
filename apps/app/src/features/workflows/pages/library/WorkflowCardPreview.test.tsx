import { metadata } from '@helpers/media/metadata/metadata.helper';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowCardPreview from './WorkflowCardPreview';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
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
