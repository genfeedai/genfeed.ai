// @vitest-environment jsdom
'use client';

import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
} from '@contexts/ui/context-sidebar-context';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CharactersTable from './characters-table';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-src={src}>{alt}</span>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const translate = translateFromCatalog('common.settings.characters');
  return {
    useTranslations: () => translate,
  };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));

const mocks = vi.hoisted(() => ({
  ingredients: new Map<string, unknown>(),
}));

vi.mock('./use-character-ingredients', () => ({
  useCharacterIngredients: () => mocks.ingredients,
}));

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: (
    ingredient: {
      mediaDelivery?: { url: string | null };
    } | null,
  ) => ingredient?.mediaDelivery ?? null,
}));

describe('CharactersTable', () => {
  beforeEach(() => {
    mocks.ingredients = new Map();
  });

  it('shows avatar and references through the issued media grant', () => {
    mocks.ingredients = new Map([
      [
        'img-1',
        {
          id: 'img-1',
          mediaDelivery: { url: 'https://signed.test/img-1?sig=1' },
        },
      ],
    ]);
    render(
      <CharactersTable
        canManageSharing={false}
        characters={[
          {
            avatarIngredientId: 'img-1',
            id: 'p1',
            label: 'Anna',
            referenceIngredientIds: ['img-1', 'img-2'],
          },
        ]}
        isLoading={false}
        onCreate={vi.fn()}
        onManageAvailability={vi.fn()}
        onManageReferences={vi.fn()}
      />,
    );

    expect(screen.getByText('Anna', { selector: 'span' })).toHaveAttribute(
      'data-src',
      'https://signed.test/img-1?sig=1',
    );
    // A reference without a readable URL shows a placeholder, not a broken image.
    expect(
      screen.getByRole('img', { name: 'Reference 2 of Anna' }),
    ).not.toHaveAttribute('data-src');
  });

  it('renders the empty state with a CTA when there are no characters', () => {
    const onCreate = vi.fn();
    render(
      <CharactersTable
        canManageSharing={false}
        characters={[]}
        isLoading={false}
        onCreate={onCreate}
        onManageAvailability={vi.fn()}
        onManageReferences={vi.fn()}
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
        onManageReferences={vi.fn()}
        characters={[
          {
            avatarIngredientId: 'img-1',
            handle: 'anna',
            id: 'p1',
            label: 'Anna',
            referenceIngredientIds: ['img-1'],
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
          { id: 'p1', label: 'Anna', referenceIngredientIds: [] },
          { id: 'p2', label: 'Vincent', referenceIngredientIds: [] },
        ]}
        isLoading={false}
        onCreate={vi.fn()}
        onManageAvailability={vi.fn()}
        onManageReferences={vi.fn()}
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

  it('shows the first four reference thumbnails and counts the rest', () => {
    mocks.ingredients = new Map(
      ['img-1', 'img-2', 'img-3', 'img-4'].map((id) => [
        id,
        { id, ingredientUrl: `https://cdn.test/${id}.jpg` },
      ]),
    );
    render(
      <CharactersTable
        canManageSharing={false}
        characters={[
          {
            avatarIngredientId: 'img-1',
            id: 'p1',
            label: 'Anna',
            referenceIngredientIds: [
              'img-1',
              'img-2',
              'img-3',
              'img-4',
              'img-5',
              'img-6',
            ],
          },
        ]}
        isLoading={false}
        onCreate={vi.fn()}
        onManageAvailability={vi.fn()}
        onManageReferences={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/^Reference \d+ of Anna$/)).toHaveLength(4);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('opens reference management from the row action', () => {
    const onManageReferences = vi.fn();
    const anna = { id: 'p1', label: 'Anna', referenceIngredientIds: [] };
    render(
      <CharactersTable
        canManageSharing={false}
        characters={[anna]}
        isLoading={false}
        onCreate={vi.fn()}
        onManageAvailability={vi.fn()}
        onManageReferences={onManageReferences}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Manage references for Anna' }),
    );
    expect(onManageReferences).toHaveBeenCalledWith(anna);
  });

  it('opens a character summary in the sidebar on row click', () => {
    const onManageReferences = vi.fn();
    const anna = {
      handle: 'anna',
      id: 'p1',
      label: 'Anna',
      referenceIngredientIds: ['img-1'],
    };
    render(
      <ContextSidebarProvider>
        <CharactersTable
          canManageSharing={false}
          characters={[anna]}
          isLoading={false}
          onCreate={vi.fn()}
          onManageAvailability={vi.fn()}
          onManageReferences={onManageReferences}
        />
        <ContextSidebarOutlet testId="rail" />
      </ContextSidebarProvider>,
    );

    fireEvent.click(screen.getByText('@anna'));

    const rail = within(screen.getByTestId('rail'));
    fireEvent.click(
      rail.getByRole('button', { name: 'Manage references for Anna' }),
    );
    expect(onManageReferences).toHaveBeenCalledWith(anna);
    expect(
      rail.getByRole('link', {
        name: 'View assets made with Anna in Library',
      }),
    ).toHaveAttribute('href', '/acme/main/library/assets?characters=p1');
  });
});
