import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandSettingsKnowledgePage from './content';

const brand = vi.hoisted(() => ({
  brandId: 'brand-1' as string | undefined,
  isReady: true,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: brand.brandId,
    isReady: brand.isReady,
    selectedBrand: { website: 'https://example.com' },
  }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, label }: { children: ReactNode; label?: string }) => (
    <main>
      {label ? <h1>{label}</h1> : null}
      {children}
    </main>
  ),
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div role="status">Loading</div>,
}));

vi.mock('./knowledge-sources-list', () => ({
  default: ({ website }: { website?: string }) => (
    <div data-testid="knowledge-sources-list">{website}</div>
  ),
}));

describe('BrandSettingsKnowledgePage', () => {
  beforeEach(() => {
    brand.brandId = 'brand-1';
    brand.isReady = true;
  });

  it('renders the sources list with the brand website', () => {
    render(<BrandSettingsKnowledgePage />);

    expect(screen.getByTestId('knowledge-sources-list')).toHaveTextContent(
      'https://example.com',
    );
  });

  it('keeps the page chrome and shows loading until the brand resolves', () => {
    brand.isReady = false;
    render(<BrandSettingsKnowledgePage />);

    expect(
      screen.getByRole('heading', { name: 'Knowledge' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(
      screen.queryByTestId('knowledge-sources-list'),
    ).not.toBeInTheDocument();
  });
});
