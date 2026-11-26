import {
  IngredientCategory,
  IngredientVersionRelation,
} from '@genfeedai/contracts';
import type {
  IIngredient,
  IIngredientVersionHistory,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseIngredientVersionsResult } from '@/props/content/ingredient.props';
import IngredientVersionHistory from './IngredientVersionHistory';

const versions = vi.hoisted(() => ({
  activated: [] as string[],
  result: undefined as unknown as UseIngredientVersionsResult,
}));

vi.mock('./use-ingredient-versions', () => ({
  useIngredientVersions: () => versions.result,
}));

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: () => null,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

function asset(id: string): IIngredient {
  return {
    category: IngredientCategory.IMAGE,
    id,
    ingredientUrl: `https://cdn.example.test/${id}.png`,
    isDeleted: false,
  } as IIngredient;
}

function setHistory(
  overrides: Partial<IIngredientVersionHistory> = {},
  controls: Partial<UseIngredientVersionsResult> = {},
) {
  const history: IIngredientVersionHistory = {
    activeVersionId: 'c',
    ingredientId: 'c',
    isLineageAvailable: true,
    items: [asset('a'), asset('b'), asset('c')],
    rootId: 'a',
    versions: [
      {
        id: 'a',
        isActive: false,
        number: 1,
        relation: IngredientVersionRelation.ORIGINAL,
      },
      {
        id: 'b',
        isActive: false,
        number: 2,
        relation: IngredientVersionRelation.VERSION,
      },
      {
        id: 'c',
        isActive: true,
        number: 3,
        relation: IngredientVersionRelation.TRANSFORMATION,
      },
    ],
    ...overrides,
  };
  versions.result = {
    activate: async (versionId: string) => {
      versions.activated.push(versionId);
      return true;
    },
    hasError: false,
    history,
    isBusy: false,
    isLoading: false,
    ...controls,
  };
}

describe('IngredientVersionHistory', () => {
  beforeEach(() => {
    versions.activated = [];
    setHistory();
  });

  it('lists the versions newest first with the active one and what created each', () => {
    render(<IngredientVersionHistory ingredientId="c" />);

    const rows = within(
      screen.getByRole('list', { name: 'Versions, newest first' }),
    ).getAllByRole('listitem');

    expect(rows.map((row) => row.textContent)).toEqual([
      'Version 3ActiveTransformation',
      'Version 2New versionMake active',
      'Version 1OriginalMake active',
    ]);
  });

  it('makes an older version active only after confirming, and keeps newer ones', () => {
    render(<IngredientVersionHistory ingredientId="c" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Make version 2 active' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Make version 2 active?',
    });
    expect(versions.activated).toEqual([]);
    expect(dialog.textContent).toContain('Newer versions stay in the history');

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Make active' }),
    );
    expect(versions.activated).toEqual(['b']);
  });

  it('closes the confirmation without changing anything on cancel', () => {
    render(<IngredientVersionHistory ingredientId="c" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Make version 1 active' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(versions.activated).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says the history is unavailable for an asset linked before relations were recorded', () => {
    setHistory({
      activeVersionId: 'x',
      isLineageAvailable: false,
      items: [asset('x')],
      rootId: 'x',
      versions: [
        {
          id: 'x',
          isActive: true,
          number: 1,
          relation: IngredientVersionRelation.UNAVAILABLE,
        },
      ],
    });
    render(<IngredientVersionHistory ingredientId="x" />);

    expect(screen.getByText(/does not guess its history/)).toBeTruthy();
    expect(screen.getByText('Lineage unavailable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Make version/ })).toBeNull();
  });

  it('keeps each row on its own asset when a version has no document', () => {
    setHistory({ items: [asset('a'), asset('c')] });
    render(<IngredientVersionHistory ingredientId="c" />);

    expect(
      screen.getByRole('img', { name: /Version 3/ }).getAttribute('src'),
    ).toBe('https://cdn.example.test/c.png');
    expect(
      screen.getByRole('img', { name: /Version 1/ }).getAttribute('src'),
    ).toBe('https://cdn.example.test/a.png');
    expect(screen.queryByRole('img', { name: /Version 2/ })).toBeNull();
  });

  it('renders nothing for an asset with a single, known version', () => {
    setHistory({
      activeVersionId: 'a',
      items: [asset('a')],
      versions: [
        {
          id: 'a',
          isActive: true,
          number: 1,
          relation: IngredientVersionRelation.ORIGINAL,
        },
      ],
    });
    const { container } = render(<IngredientVersionHistory ingredientId="a" />);

    expect(container.textContent).toBe('');
  });

  it('reports a failed load without a list', () => {
    setHistory({}, { hasError: true, history: null });
    render(<IngredientVersionHistory ingredientId="c" />);

    expect(screen.getByRole('status').textContent).toBe(
      'The versions could not be loaded right now.',
    );
  });
});
