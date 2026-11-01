import type { ITag } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IngredientTagChips from './ingredient-tag-chips';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function tags(count: number): ITag[] {
  return Array.from({ length: count }, (_, index) => ({
    backgroundColor: '#000000',
    id: `tag-${index}`,
    label: `Tag ${index}`,
    textColor: '#ffffff',
  })) as ITag[];
}

describe('IngredientTagChips', () => {
  it.each([undefined, []])('renders nothing for %p', (value) => {
    const { container } = render(<IngredientTagChips tags={value} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows every tag up to the limit as a list', () => {
    render(<IngredientTagChips tags={tags(2)} />);

    expect(screen.getByRole('list', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Tag 0')).toBeInTheDocument();
    expect(screen.getByText('Tag 1')).toBeInTheDocument();
  });

  it('collapses the rest into a count that names them', () => {
    render(<IngredientTagChips tags={tags(5)} />);

    expect(screen.getByText('Tag 2')).toBeInTheDocument();
    expect(screen.queryByText('Tag 3')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toHaveAttribute('title', 'Tag 3, Tag 4');
  });

  it('honors a custom limit', () => {
    render(<IngredientTagChips max={1} tags={tags(3)} />);

    expect(screen.getByText('Tag 0')).toBeInTheDocument();
    expect(screen.queryByText('Tag 1')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});
