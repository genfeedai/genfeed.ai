import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IngredientStackBadge from './ingredient-stack-badge';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('IngredientStackBadge', () => {
  it('names the image count of a carousel cover', () => {
    render(<IngredientStackBadge stack={{ count: 6, postId: 'post-1' }} />);

    expect(screen.getByLabelText('Carousel of 6 images')).toHaveTextContent(
      '6',
    );
  });

  it('renders nothing for an asset that is not a cover', () => {
    const { container } = render(<IngredientStackBadge stack={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
