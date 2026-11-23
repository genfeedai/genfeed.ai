import type {
  AgentIngredientItem,
  AgentUiActionOf,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { LibraryGridItem } from '@genfeedai/props/ui/content/library-picker.props';
import LibraryGrid from '@ui/content/library-picker/LibraryGrid';
import { Button } from '@ui/primitives/button';
import { Check, Image } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

type Ingredient = AgentIngredientItem;

interface IngredientPickerCardProps {
  action: AgentUiActionOf<'ingredient_picker_card'>;
  onSelect?: (ingredient: { id: string; title?: string }) => void;
}

function toGridItem(ingredient: Ingredient): LibraryGridItem {
  return {
    id: ingredient.id,
    kind: ingredient.type,
    thumbnailUrl:
      ingredient.thumbnailUrl ??
      (ingredient.type === 'video' ? null : ingredient.url),
    title: ingredient.title ?? 'Select ingredient',
  };
}

export function IngredientPickerCard({
  action,
  onSelect,
}: IngredientPickerCardProps): ReactElement {
  const ingredients = action.ingredients ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const selectedIngredient = ingredients.find((i) => i.id === selectedId);
  const gridItems = useMemo(() => ingredients.map(toGridItem), [ingredients]);
  const selectedIds = useMemo(
    () => new Set(selectedId ? [selectedId] : []),
    [selectedId],
  );

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
          className="underline-offset-2 hover:underline"
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 border border-border bg-background">
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

      <div className="p-2">
        {ingredients.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No ingredients available
          </p>
        ) : (
          <LibraryGrid
            ariaLabel={action.title}
            items={gridItems}
            onSelect={(item) => {
              const ingredient = ingredients.find((i) => i.id === item.id);
              if (ingredient) {
                handlePick(ingredient);
              }
            }}
            selectedIds={selectedIds}
          />
        )}
      </div>

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
