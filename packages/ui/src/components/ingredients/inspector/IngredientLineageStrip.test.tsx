import {
  IngredientCategory,
  IngredientLineageDirection,
  IngredientOrigin,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { UseIngredientLineageResult } from '@genfeedai/props/content/ingredient.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IngredientLineageStrip from './IngredientLineageStrip';

const lineage = vi.hoisted(() => ({
  result: undefined as unknown as UseIngredientLineageResult,
}));

vi.mock('./use-ingredient-lineage', () => ({
  useIngredientLineage: () => lineage.result,
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

function asset(overrides: Partial<IIngredient> & { id: string }): IIngredient {
  return {
    category: IngredientCategory.IMAGE,
    isDeleted: false,
    ...overrides,
  } as IIngredient;
}

function setLineage(overrides: Partial<UseIngredientLineageResult> = {}) {
  lineage.result = {
    hasError: false,
    hasNext: false,
    hiddenCount: 0,
    isLoading: false,
    items: [],
    loadMore: vi.fn(),
    ...overrides,
  };
}

describe('IngredientLineageStrip', () => {
  beforeEach(() => {
    setLineage();
  });

  it('lists each reference with its name, type and origin under "Made from"', () => {
    setLineage({
      items: [
        asset({
          id: 'sheet',
          ingredientUrl: 'https://cdn.genfeed.ai/sheet.jpg',
          metadataLabel: 'Character sheet',
          origin: IngredientOrigin.UPLOADED,
        }),
        asset({
          id: 'logo',
          ingredientUrl: 'https://cdn.genfeed.ai/logo.jpg',
          metadataLabel: 'Logo',
          origin: IngredientOrigin.IMPORTED,
        }),
      ],
    });

    render(
      <IngredientLineageStrip
        direction={IngredientLineageDirection.MADE_FROM}
        ingredientId="output"
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Made from' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Character sheet')).toBeInTheDocument();
    expect(screen.getByText('Logo')).toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Character sheet' }),
    ).toHaveAttribute('src', 'https://cdn.genfeed.ai/sheet.jpg');
  });

  it('labels the outputs strip "Used in"', () => {
    setLineage({
      items: [
        asset({
          id: 'out',
          metadataLabel: 'Hero shot',
          origin: IngredientOrigin.GENERATED,
        }),
      ],
    });

    render(
      <IngredientLineageStrip
        direction={IngredientLineageDirection.USED_IN}
        ingredientId="sheet"
      />,
    );

    expect(screen.getByRole('region', { name: 'Used in' })).toBeInTheDocument();
    expect(screen.getByText('Generated')).toBeInTheDocument();
  });

  it('shows a trashed reference as "Deleted reference" without a thumbnail', () => {
    setLineage({
      items: [
        asset({
          id: 'gone',
          ingredientUrl: 'https://cdn.genfeed.ai/should-not-render.jpg',
          isDeleted: true,
          metadataLabel: 'Old sheet',
          origin: IngredientOrigin.UPLOADED,
        }),
      ],
    });

    render(
      <IngredientLineageStrip
        direction={IngredientLineageDirection.MADE_FROM}
        ingredientId="output"
      />,
    );

    expect(screen.getByText('Deleted reference')).toBeInTheDocument();
    // Where it came from survives the trash; what it was does not.
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    expect(screen.queryByText('Old sheet')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('counts references the member cannot access without naming them', () => {
    setLineage({
      hiddenCount: 2,
      items: [asset({ id: 'sheet', metadataLabel: 'Character sheet' })],
    });

    render(
      <IngredientLineageStrip
        direction={IngredientLineageDirection.MADE_FROM}
        ingredientId="output"
      />,
    );

    expect(
      screen.getByText('2 more are not available to you'),
    ).toBeInTheDocument();
  });

  it('shows only the hidden count when every reference is inaccessible', () => {
    setLineage({ hiddenCount: 1 });

    render(
      <IngredientLineageStrip
        direction={IngredientLineageDirection.MADE_FROM}
        ingredientId="output"
      />,
    );

    expect(
      screen.getByText('1 more is not available to you'),
    ).toBeInTheDocument();
  });

  it('loads the next page on request', () => {
    const loadMore = vi.fn();
    setLineage({
      hasNext: true,
      items: [asset({ id: 'sheet', metadataLabel: 'Character sheet' })],
      loadMore,
    });

    render(
      <IngredientLineageStrip
        direction={IngredientLineageDirection.USED_IN}
        ingredientId="sheet"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(loadMore).toHaveBeenCalledOnce();
  });

  it.each([
    ['nothing to show', {}],
    ['the first page is loading', { isLoading: true }],
  ])('renders nothing while %s', (_label, overrides) => {
    setLineage(overrides);

    const { container } = render(
      <IngredientLineageStrip
        direction={IngredientLineageDirection.MADE_FROM}
        ingredientId="output"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('says so when the first page fails to load', () => {
    setLineage({ hasError: true });

    render(
      <IngredientLineageStrip
        direction={IngredientLineageDirection.MADE_FROM}
        ingredientId="output"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This could not be loaded right now.',
    );
  });
});
