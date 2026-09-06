import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Metadata } from '@genfeedai/models/content/metadata.model';
import { Image as IngredientImage } from '@genfeedai/models/ingredients/image.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { Button } from '@ui/primitives/button';
import { Check, Image } from 'lucide-react';
import { type ReactElement, useCallback, useState } from 'react';

type Ingredient = NonNullable<AgentUiAction['ingredients']>[number];

interface IngredientPickerCardProps {
  action: AgentUiAction;
  onSelect?: (ingredient: { id: string; title?: string }) => void;
}

function IngredientThumbnail({
  ingredient,
  isSelected,
  onPick,
}: {
  ingredient: Ingredient;
  isSelected: boolean;
  onPick: (ingredient: Ingredient) => void;
}): ReactElement {
  const media = {
    id: ingredient.id,
    cdnUrl: ingredient.url,
    metadata: new Metadata({
      label: ingredient.title ?? 'Select ingredient',
      width: 1,
      height: 1,
    }),
  };
  const sharedProps = {
    isActionsEnabled: false,
    isContainerHovered: true,
    isDragEnabled: false,
    isSelected,
    onClickIngredient: () => onPick(ingredient),
  };

  return (
    <div className="min-w-0">
      {ingredient.type === 'video' ? (
        <LazyMasonryVideo {...sharedProps} video={new Video(media)} />
      ) : (
        <LazyMasonryImage
          {...sharedProps}
          image={
            new IngredientImage({
              ...media,
              cdnUrl: ingredient.thumbnailUrl ?? ingredient.url,
            })
          }
        />
      )}
    </div>
  );
}

export function IngredientPickerCard({
  action,
  onSelect,
}: IngredientPickerCardProps): ReactElement {
  const ingredients = action.ingredients ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const selectedIngredient = ingredients.find((i) => i.id === selectedId);

  const handlePick = useCallback(
    (ingredient: Ingredient) => {
      if (confirmed) return;
      setSelectedId(ingredient.id);
    },
    [confirmed],
  );

  const handleConfirm = useCallback(() => {
    if (!selectedIngredient) return;
    setConfirmed(true);
    onSelect?.({ id: selectedIngredient.id, title: selectedIngredient.title });
  }, [selectedIngredient, onSelect]);

  const handleChange = useCallback(() => {
    setConfirmed(false);
    setSelectedId(null);
  }, []);

  if (confirmed && selectedIngredient) {
    return (
      <div className="mt-2 flex items-center justify-between border border-border bg-background px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Check className="size-4 text-primary" />
          <span className="text-sm text-foreground">
            Selected:{' '}
            <span className="font-medium">
              {selectedIngredient.title ?? selectedIngredient.id}
            </span>
          </span>
        </div>
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          onClick={handleChange}
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 border border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Image className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{action.title}</p>
          {action.description && (
            <p className="truncate text-xs text-muted-foreground">
              {action.description}
            </p>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="p-2">
        {ingredients.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No ingredients available
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {ingredients.map((ingredient) => (
              <IngredientThumbnail
                key={ingredient.id}
                ingredient={ingredient}
                isSelected={selectedId === ingredient.id}
                onPick={handlePick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm button */}
      {selectedId && (
        <div className="border-t border-border p-2">
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            onClick={handleConfirm}
            className="w-full"
          >
            <Check className="size-3.5" />
            Use this ingredient
          </Button>
        </div>
      )}
    </div>
  );
}
