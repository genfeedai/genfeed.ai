// @vitest-environment jsdom
'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CharactersTable from './characters-table';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-src={src}>{alt}</span>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.characters');
  return {
    useTranslations: () => translate,
  };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'https://cdn.test/ingredients',
  },
}));

describe('CharactersTable', () => {
  it('renders the empty state with a CTA when there are no characters', () => {
    const onCreate = vi.fn();
    render(
      <CharactersTable
        canManageSharing={false}
        characters={[]}
        isLoading={false}
        onCreate={onCreate}
        onManageAvailability={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('New character'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('renders a row per character with avatar and handle', () => {
    render(
      <CharactersTable
        canManageSharing={false}
        onManageAvailability={vi.fn()}
        characters={[
          {
            avatarIngredientId: 'img-1',
            handle: 'anna',
            id: 'p1',
            label: 'Anna',
          },
        ]}
        isLoading={false}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Anna').length).toBeGreaterThan(0);
    expect(screen.getByText('@anna')).toBeInTheDocument();
  });

  it('links each row to the Library filtered to that character', () => {
    render(
      <CharactersTable
        canManageSharing={false}
        characters={[
          { id: 'p1', label: 'Anna' },
          { id: 'p2', label: 'Vincent' },
        ]}
        isLoading={false}
        onCreate={vi.fn()}
        onManageAvailability={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('link', {
        name: 'View assets made with Anna in Library',
      }),
    ).toHaveAttribute('href', '/acme/main/library/assets?characters=p1');
    expect(
      screen.getByRole('link', {
        name: 'View assets made with Vincent in Library',
      }),
    ).toHaveAttribute('href', '/acme/main/library/assets?characters=p2');
  });
});
