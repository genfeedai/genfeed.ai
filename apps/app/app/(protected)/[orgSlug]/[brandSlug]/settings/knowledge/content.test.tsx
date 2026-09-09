import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import BrandSettingsKnowledgePage from './content';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    selectedBrand: { website: 'https://example.com' },
  }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    label,
    right,
  }: {
    children: ReactNode;
    label?: string;
    right?: ReactNode;
  }) => (
    <main>
      {label ? <h1>{label}</h1> : null}
      {right}
      {children}
    </main>
  ),
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div role="status">Loading</div>,
}));

vi.mock('./knowledge-sources-list', () => ({
  default: () => <div data-testid="knowledge-sources-list" />,
}));

describe('BrandSettingsKnowledgePage', () => {
  it('renders knowledge sources inside brand settings chrome', () => {
    render(<BrandSettingsKnowledgePage />);

    expect(
      screen.getByRole('heading', { name: 'Knowledge' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Seed from Brand Kit' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add source' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-sources-list')).toBeInTheDocument();
  });
});
