import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { type ReactElement, useCallback, useState } from 'react';
import { HiCheck, HiPhoto } from 'react-icons/hi2';

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
  const [isLoaded, setIsLoaded] = useState(false);
  const src = ingredient.thumbnailUrl ?? ingredient.url;

  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={() => onPick(ingredient)}
      className={`group relative aspect-square overflow-hidden rounded border transition-all duration-150 ${
        isSelected
          ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-background'
          : 'border-border hover:border-primary/60'
      }`}
    >
      {!isLoaded && <div className="absolute inset-0 animate-pulse bg-muted" />}
      {ingredient.type === 'video' ? (
        <video
          src={src}
          className={`h-full w-full object-cover transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoadedData={() => setIsLoaded(true)}
          muted
          playsInline
        />
      ) : (
        <img
          src={src}
          alt={ingredient.title ?? 'Ingredient'}
          className={`h-full w-full object-cover transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIsLoaded(true)}
        />
      )}

      {/* Hover overlay with title */}
      {ingredient.title && (
        <div className="absolute inset-0 flex items-end bg-black/0 p-1 opacity-0 transition-all duration-150 group-hover:bg-black/40 group-hover:opacity-100">
          <span className="line-clamp-2 text-[10px] font-medium leading-tight text-white">
            {ingredient.title}
          </span>
        </div>
      )}

      {/* Selected checkmark */}
      {isSelected && (
        <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
          <HiCheck className="h-2.5 w-2.5 text-primary-foreground" />
        </div>
      )}
    </Button>
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
      <div className="mt-2 flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
        <div className="flex items-center gap-2">
          <HiCheck className="h-4 w-4 text-primary" />
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
    <div className="mt-2 rounded-lg border border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <HiPhoto className="h-4 w-4 shrink-0 text-muted-foreground" />
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
        <div className="border-t border-border px-2 py-2">
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            onClick={handleConfirm}
            className="w-full"
          >
            <HiCheck className="h-3.5 w-3.5" />
            Use this ingredient
          </Button>
        </div>
      )}
    </div>
  );
}
