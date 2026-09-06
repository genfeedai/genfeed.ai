import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import List from '@ui/lists/list/List';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: ({ audioUrl }: { audioUrl?: string }) => (
    <button type="button" data-testid="shared-audio-player" data-url={audioUrl}>
      Play preview
    </button>
  ),
}));

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

  it('keeps shared playback separate from row selection', () => {
    const onConfirm = vi.fn();
    render(<List {...defaultProps} onConfirm={onConfirm} />);
    const players = screen.getAllByTestId('shared-audio-player');
    expect(players).toHaveLength(2);
    expect(players[0]).toHaveAttribute(
      'data-url',
      'http://example.com/sound1.mp3',
    );
    fireEvent.click(players[0]);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ing_1' }));
    expect(onConfirm).toHaveBeenCalledWith('ing_1');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <List {...defaultProps} className="custom-class" />,
    );
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});
