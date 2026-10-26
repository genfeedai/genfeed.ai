import ModelsCatalogRoute from '@app/(protected)/[orgSlug]/~/settings/models/ModelsCatalogRoute';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSearchParams = vi.hoisted(() => ({
  current: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams.current,
}));

vi.mock(
  '@app/(protected)/[orgSlug]/~/settings/models/[type]/page-content',
  () => ({
    default: ({ type }: { type: string }) => (
      <div data-testid="models-content">{type}</div>
    ),
  }),
);

function renderedType(): string | null {
  return screen.getByTestId('models-content').textContent;
}

describe('ModelsCatalogRoute', () => {
  beforeEach(() => {
    mockSearchParams.current = new URLSearchParams();
  });

  it('shows the unfiltered catalog without a type', () => {
    render(<ModelsCatalogRoute />);

    expect(renderedType()).toBe('all');
  });

  it.each([
    ['image', 'image'],
    ['video', 'video'],
    ['music', 'music'],
    ['images', 'image'],
    ['videos', 'video'],
  ])('passes the catalog group %s through as %s', (query, expected) => {
    mockSearchParams.current = new URLSearchParams({ type: query });

    render(<ModelsCatalogRoute />);

    expect(renderedType()).toBe(expected);
  });

  it.each(['trainings', 'custom-models', 'unknown', ''])(
    'falls back to the unfiltered catalog for type=%s instead of switching surfaces',
    (query) => {
      mockSearchParams.current = new URLSearchParams({ type: query });

      render(<ModelsCatalogRoute />);

      expect(renderedType()).toBe('all');
    },
  );

  it('follows query changes and clears back to the full catalog', () => {
    mockSearchParams.current = new URLSearchParams({ type: 'video' });
    const { rerender } = render(<ModelsCatalogRoute />);
    expect(renderedType()).toBe('video');

    mockSearchParams.current = new URLSearchParams({ type: 'image' });
    rerender(<ModelsCatalogRoute />);
    expect(renderedType()).toBe('image');

    mockSearchParams.current = new URLSearchParams();
    rerender(<ModelsCatalogRoute />);
    expect(renderedType()).toBe('all');
  });
});
