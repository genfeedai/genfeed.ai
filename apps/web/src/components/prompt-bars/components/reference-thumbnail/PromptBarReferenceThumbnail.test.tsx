// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PromptBarReferenceThumbnail from './PromptBarReferenceThumbnail';

const mocks = vi.hoisted(() => ({
  ingredients: new Map<string, unknown>(),
  grant: null as { url: string | null } | null,
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-src={src}>{alt}</span>
  ),
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: { cdnUrl: 'https://cdn.test' },
}));

vi.mock('@/hooks/media/use-ingredients-by-id', () => ({
  useIngredientsById: () => mocks.ingredients,
}));

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: () => mocks.grant,
}));

describe('PromptBarReferenceThumbnail', () => {
  beforeEach(() => {
    mocks.ingredients = new Map();
    mocks.grant = null;
  });

  it('shows an ingredient reference through its media grant', () => {
    mocks.ingredients = new Map([['ref-1', { id: 'ref-1' }]]);
    mocks.grant = { url: 'https://signed.test/ref-1?sig=1' };
    render(
      <PromptBarReferenceThumbnail
        alt="Reference"
        reference={{ id: 'ref-1' }}
        referenceSource="ingredient"
        size={32}
      />,
    );

    expect(screen.getByText('Reference')).toHaveAttribute(
      'data-src',
      'https://signed.test/ref-1?sig=1',
    );
  });

  it('shows a placeholder, not a raw CDN path, when no URL is available', () => {
    render(
      <PromptBarReferenceThumbnail
        alt="Reference"
        reference={{ id: 'ref-1' }}
        referenceSource="ingredient"
        size={32}
      />,
    );

    expect(screen.getByRole('img', { name: 'Reference' })).not.toHaveAttribute(
      'data-src',
    );
  });

  it('keeps a brand reference on its own asset URL', () => {
    render(
      <PromptBarReferenceThumbnail
        alt="Reference"
        reference={{ id: 'brand-ref' }}
        referenceSource="brand"
        size={32}
      />,
    );

    expect(screen.getByText('Reference')).toHaveAttribute(
      'data-src',
      'https://cdn.test/references/brand-ref',
    );
  });
});
