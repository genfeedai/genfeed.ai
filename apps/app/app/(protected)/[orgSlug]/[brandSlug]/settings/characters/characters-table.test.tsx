// @vitest-environment jsdom
'use client';

import { render, screen } from '@testing-library/react';
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

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'https://cdn.test/ingredients',
  },
}));

describe('CharactersTable', () => {
  it('renders a row per character with avatar and handle', () => {
    render(
      <CharactersTable
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
});
