import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import BrandDeleteBlockedDialog from './brand-delete-blocked-dialog';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

describe('BrandDeleteBlockedDialog', () => {
  const characters = [
    { handle: 'anna', id: 'p1', label: 'Anna' },
    { handle: null, id: 'p2', label: 'Ben' },
  ];

  it('names the characters that must move and links to the brand characters', () => {
    render(
      <BrandDeleteBlockedDialog
        brandLabel="Podcast"
        brandSlug="podcast"
        characters={characters}
        onClose={vi.fn()}
        orgSlug="acme"
      />,
    );

    const list = screen.getByTestId('blocked-list');
    expect(list).toHaveTextContent('Anna');
    expect(list).toHaveTextContent('@anna');
    expect(list).toHaveTextContent('Ben');
    expect(
      screen.getByRole('link', { name: 'Manage characters' }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/podcast/settings/characters'),
    );
  });

  it('stays closed without blocking characters and closes on request', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <BrandDeleteBlockedDialog
        brandLabel="Podcast"
        characters={[]}
        onClose={onClose}
      />,
    );
    expect(screen.queryByTestId('blocked-list')).not.toBeInTheDocument();

    rerender(
      <BrandDeleteBlockedDialog
        brandLabel="Podcast"
        characters={characters}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('blocked-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
