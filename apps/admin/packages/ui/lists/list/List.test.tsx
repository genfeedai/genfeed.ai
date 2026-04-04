import type { IIngredient } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import List from '@ui/lists/list/List';
import { describe, expect, it, vi } from 'vitest';

describe('List', () => {
  const mockIngredients: IIngredient[] = [
    {
      category: 'music',
      id: 'ing_1',
      ingredientUrl: 'http://example.com/sound1.mp3',
      isPlaying: false,
      name: 'Test Sound 1',
    } as IIngredient,
    {
      category: 'music',
      id: 'ing_2',
      ingredientUrl: 'http://example.com/sound2.mp3',
      isPlaying: false,
      name: 'Test Sound 2',
    } as IIngredient,
  ];

  const defaultProps = {
    ingredients: mockIngredients,
    label: 'Sounds',
    onConfirm: vi.fn(),
    setIngredients: vi.fn(),
  };

  it('should render without crashing', () => {
    const { container } = render(<List {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render the label', () => {
    render(<List {...defaultProps} />);
    expect(screen.getByText('Sounds')).toBeInTheDocument();
  });

  it('should render all ingredients with indices', () => {
    render(<List {...defaultProps} />);
    // The component renders list items with index numbers
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <List {...defaultProps} className="custom-class" />,
    );
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});
