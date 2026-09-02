import { formatEnumLabel } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';

type Props = {
  ingredient: IIngredient;
};

export default function IngredientOverlayBadges({ ingredient }: Props) {
  return (
    <>
      <span className="rounded-full border border-border bg-tertiary px-3 py-1 text-2xs uppercase tracking-[0.22em] text-muted-foreground">
        Ingredient
      </span>
      <span className="rounded-full border border-border bg-tertiary px-3 py-1 text-xs text-muted-foreground">
        {formatEnumLabel(ingredient.category)}
      </span>
      <span className="rounded-full border border-border bg-tertiary px-3 py-1 text-xs text-muted-foreground">
        {formatEnumLabel(ingredient.status)}
      </span>
    </>
  );
}
