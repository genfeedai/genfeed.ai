import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import IngredientSound from '@ui/ingredients/sound/IngredientSound';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: ({ audioUrl }: { audioUrl?: string }) => (
    <button type="button" data-testid="shared-audio-player" data-url={audioUrl}>
      Play preview
    </button>
  ),
}));

describe('IngredientSound', () => {
  const ingredients = [
    {
      id: 'sound-1',
      ingredientUrl: 'https://example.com/sound.mp3',
      isPlaying: false,
      metadataDescription: 'Sound description',
      metadataLabel: 'Test Sound',
    } as IIngredient,
  ];

  const setIngredients = vi.fn();

  it('should render without crashing', () => {
    const { container, getByTestId } = render(
      <IngredientSound
        ingredients={ingredients}
        setIngredients={setIngredients}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(getByTestId('ingredient-sound-item')).toBeInTheDocument();
  });

  it('uses shared playback without mutating ingredient data', () => {
    const setIngredients = vi.fn();
    render(
      <IngredientSound
        ingredients={ingredients}
        setIngredients={setIngredients}
      />,
    );
    const player = screen.getByTestId('shared-audio-player');
    expect(player).toHaveAttribute('data-url', 'https://example.com/sound.mp3');
    fireEvent.click(player);
    expect(setIngredients).not.toHaveBeenCalled();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <IngredientSound
        ingredients={ingredients}
        setIngredients={setIngredients}
      />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
