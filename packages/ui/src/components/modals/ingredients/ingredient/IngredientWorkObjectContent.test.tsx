import { render, screen } from '@testing-library/react';
import IngredientWorkObjectContent from '@ui/modals/ingredients/ingredient/IngredientWorkObjectContent';
import { describe, expect, it } from 'vitest';

describe('Library work object content', () => {
  it('renders persisted table cells directly from the canonical material', () => {
    render(
      <IngredientWorkObjectContent
        material={{
          kind: 'table',
          title: 'Shooting script',
          columns: [
            { key: 'shot', label: 'Shot' },
            { key: 'script', label: 'Script' },
          ],
          rows: [{ shot: 'Opening', script: 'The saved revision' }],
        }}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Shooting script' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('cell', { name: 'The saved revision' }),
    ).toBeInTheDocument();
  });

  it.each(['script', 'brief'] as const)(
    'shows a saved %s body without interpreting HTML',
    (kind) => {
      const { container } = render(
        <IngredientWorkObjectContent
          material={{
            kind,
            title: 'Draft',
            body: '<script>danger()</script>\nA saved paragraph.',
          }}
        />,
      );
      expect(screen.getByText(/A saved paragraph/)).toBeInTheDocument();
      expect(container.querySelector('script')).toBeNull();
    },
  );
});
