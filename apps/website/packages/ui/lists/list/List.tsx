import type { IIngredient } from '@genfeedai/interfaces';
import { IngredientCategory } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAudioPlayer } from '@hooks/media/use-audio-player/use-audio-player';
import { Ingredient } from '@models/content/ingredient.model';
import type { ListProps } from '@props/content/list.props';
import ListRowSound from '@ui/lists/row-sound/ListRowSound';

const PLAYABLE_CATEGORIES = new Set([
  IngredientCategory.VOICE,
  IngredientCategory.MUSIC,
]);

export default function List({
  label,
  ingredients,
  className,
  selectedId,
  setIngredients,
  onConfirm = () => {},
}: ListProps) {
  const { play, stop } = useAudioPlayer();

  function stopAll(): void {
    stop();
    setIngredients((prev: IIngredient[]) =>
      prev.map(
        (item: IIngredient) => new Ingredient({ ...item, isPlaying: false }),
      ),
    );
  }

  function onPlay(e: React.MouseEvent, ingredient: IIngredient): void {
    e.stopPropagation();

    if (!PLAYABLE_CATEGORIES.has(ingredient.category)) {
      return;
    }

    if (ingredient.isPlaying) {
      stopAll();
      return;
    }

    setIngredients((prev: IIngredient[]) =>
      prev.map(
        (item: IIngredient) =>
          new Ingredient({ ...item, isPlaying: item.id === ingredient.id }),
      ),
    );

    if (ingredient.ingredientUrl) {
      play(ingredient.ingredientUrl, stopAll);
    }
  }

  return (
    <ul className={cn('list', className)}>
      <li className="text-xs opacity-60 tracking-wide">{label}</li>

      {ingredients.map((ingredient, index) => (
        <ListRowSound
          key={ingredient.id}
          index={index}
          ingredient={ingredient}
          isSelected={selectedId === ingredient.id}
          onClick={onConfirm}
          onPlay={(e: React.MouseEvent) => onPlay(e, ingredient)}
        />
      ))}
    </ul>
  );
}
