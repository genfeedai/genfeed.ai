import { render, screen } from '@testing-library/react';
import CharacterReferenceUsageNotice from '@ui/characters/CharacterReferenceUsageNotice';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}));

describe('CharacterReferenceUsageNotice', () => {
  it('names each affected character once, by @handle', () => {
    render(
      <CharacterReferenceUsageNotice
        usage={[
          {
            characters: [{ handle: 'vincent', id: 'p1', label: 'Vincent' }],
            ingredientId: 'img-1',
          },
          {
            characters: [
              { handle: 'vincent', id: 'p1', label: 'Vincent' },
              { handle: null, id: 'p2', label: 'Anna' },
            ],
            ingredientId: 'img-2',
          },
        ]}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('item:@vincent')).toBeTruthy();
    expect(screen.getByText('item:Anna')).toBeTruthy();
  });

  it('renders nothing when no character uses the assets', () => {
    const { container } = render(
      <CharacterReferenceUsageNotice
        usage={[{ characters: [], ingredientId: 'img-1' }]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
