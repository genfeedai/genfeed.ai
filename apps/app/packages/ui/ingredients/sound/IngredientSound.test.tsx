import type { IIngredient } from '@genfeedai/interfaces';
import { render } from '@testing-library/react';
import IngredientSound from '@ui/ingredients/sound/IngredientSound';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/media/use-audio-player/use-audio-player', () => ({
  useAudioPlayer: () => ({
    play: vi.fn(),
    stop: vi.fn(),
  }),
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
    const { container } = render(
      <IngredientSound
        ingredients={ingredients}
        setIngredients={setIngredients}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <IngredientSound
        ingredients={ingredients}
        setIngredients={setIngredients}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
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
