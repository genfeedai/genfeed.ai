import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IngredientStackStrip from './IngredientStackStrip';

const stack = vi.hoisted(() => ({
  data: undefined as IIngredient[] | undefined,
}));

vi.mock('@hooks/auth/use-authed-query/use-authed-query', () => ({
  useAuthedQuery: () => ({ data: stack.data }),
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

function slide(id: string, label: string): IIngredient {
  return {
    category: IngredientCategory.IMAGE,
    id,
    isDeleted: false,
    metadataLabel: label,
  } as IIngredient;
}

describe('IngredientStackStrip', () => {
  beforeEach(() => {
    stack.data = undefined;
  });

  it('lists every slide of the carousel in order under its image count', () => {
    stack.data = [slide('a', 'Cover'), slide('b', 'Middle'), slide('c', 'Last')];

    render(<IngredientStackStrip ingredientId="b" />);

    const section = screen.getByRole('region', { name: 'Carousel' });
    expect(
      within(section).getByRole('heading', { name: 'Carousel of 3 images' }),
    ).toBeInTheDocument();
    expect(
      within(section)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Cover'),
      expect.stringContaining('Middle'),
      expect.stringContaining('Last'),
    ]);
  });

  it('renders nothing for an asset that is not in a carousel', () => {
    stack.data = [];

    const { container } = render(<IngredientStackStrip ingredientId="a" />);

    expect(container).toBeEmptyDOMElement();
  });
});
