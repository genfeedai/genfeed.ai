import { IngredientCategory } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ListProps } from '@genfeedai/props/content/list.props';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
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
  onConfirm = () => {},
}: ListProps) {
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
          playbackControl={
            PLAYABLE_CATEGORIES.has(ingredient.category) ? (
              <AudioPreviewPlayer
                audioUrl={ingredient.ingredientUrl}
                label={ingredient.metadataLabel || ingredient.id}
                stopOnUnmount
              />
            ) : undefined
          }
        />
      ))}
    </ul>
  );
}
