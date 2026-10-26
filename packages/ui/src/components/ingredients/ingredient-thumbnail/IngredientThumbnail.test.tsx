// @vitest-environment jsdom
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import IngredientThumbnail from './IngredientThumbnail';

const mocks = vi.hoisted(() => ({
  grant: null as { url: string | null } | null,
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    fill,
    src,
  }: {
    alt: string;
    fill?: boolean;
    src: string;
  }) => (
    <span data-fill={fill ? 'true' : undefined} data-src={src}>
      {alt}
    </span>
  ),
}));

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: () => mocks.grant,
}));

const ingredient = {
  id: 'img-1',
  ingredientUrl: 'https://cdn.test/images/img-1.jpg',
} as IIngredient;

describe('IngredientThumbnail', () => {
  beforeEach(() => {
    mocks.grant = null;
  });

  it('shows the ingredient URL when no media grant is issued', () => {
    render(
      <IngredientThumbnail alt="Anna" ingredient={ingredient} size={40} />,
    );

    expect(screen.getByText('Anna')).toHaveAttribute(
      'data-src',
      'https://cdn.test/images/img-1.jpg',
    );
  });

  it('prefers the issued media grant', () => {
    mocks.grant = { url: 'https://signed.test/img-1?sig=1' };
    render(
      <IngredientThumbnail alt="Anna" ingredient={ingredient} size={40} />,
    );

    expect(screen.getByText('Anna')).toHaveAttribute(
      'data-src',
      'https://signed.test/img-1?sig=1',
    );
  });

  it('shows a placeholder while the grant has no URL or the ingredient is unknown', () => {
    mocks.grant = { url: null };
    const { rerender } = render(
      <IngredientThumbnail alt="Anna" ingredient={ingredient} size={40} />,
    );
    expect(screen.getByRole('img', { name: 'Anna' })).not.toHaveAttribute(
      'data-src',
    );

    mocks.grant = null;
    rerender(
      <IngredientThumbnail alt="Anna" ingredient={undefined} size={40} />,
    );
    expect(screen.getByRole('img', { name: 'Anna' })).toBeInTheDocument();
  });

  it('fills the positioned parent when no size is given', () => {
    render(<IngredientThumbnail alt="Anna" ingredient={ingredient} />);

    expect(screen.getByText('Anna')).toHaveAttribute('data-fill', 'true');
  });

  it('keeps the placeholder inside a filling parent', () => {
    render(<IngredientThumbnail alt="Anna" ingredient={undefined} />);

    expect(screen.getByRole('img', { name: 'Anna' })).toHaveClass(
      'absolute',
      'inset-0',
    );
  });
});
