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

describe('ModelsCatalogRoute', () => {
  beforeEach(() => {
    mockSearchParams.current = new URLSearchParams();
  });

  it('shows the full catalog without a type filter', () => {
    render(<ModelsCatalogRoute />);

    expect(screen.getByTestId('models-content')).toHaveTextContent('all');
  });

  it('passes the ?type= filter through to the catalog list', () => {
    mockSearchParams.current = new URLSearchParams('type=video');

    render(<ModelsCatalogRoute />);

    expect(screen.getByTestId('models-content')).toHaveTextContent('video');
  });
});
