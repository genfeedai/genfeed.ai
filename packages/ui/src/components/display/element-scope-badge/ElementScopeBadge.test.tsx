import { render, screen } from '@testing-library/react';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('ElementScopeBadge', () => {
  it('labels platform defaults', () => {
    render(<ElementScopeBadge isPlatformDefault />);

    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument();
  });

  it('labels organization elements and inactive state', () => {
    render(<ElementScopeBadge isActive={false} />);

    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });
});
