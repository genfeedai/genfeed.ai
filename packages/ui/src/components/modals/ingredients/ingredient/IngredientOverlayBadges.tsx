import type { IIngredient } from '@genfeedai/interfaces';

type Props = {
  ingredient: IIngredient;
};

export default function IngredientOverlayBadges({ ingredient }: Props) {
  return (
    <>
      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-foreground/55">
        Ingredient
      </span>
      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
        {ingredient.category}
      </span>
      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
        {ingredient.status}
      </span>
    </>
  );
}
