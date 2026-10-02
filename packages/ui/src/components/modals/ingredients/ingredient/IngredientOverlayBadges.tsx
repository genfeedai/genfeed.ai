import { formatEnumLabel } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import Badge from '@ui/display/badge/Badge';

type Props = {
  ingredient: IIngredient;
};

export default function IngredientOverlayBadges({ ingredient }: Props) {
  return (
    <>
      <Badge variant="ghost" className="uppercase tracking-wide">
        Ingredient
      </Badge>
      <Badge variant="ghost">{formatEnumLabel(ingredient.category)}</Badge>
      <Badge status={ingredient.status}>
        {formatEnumLabel(ingredient.status)}
      </Badge>
    </>
  );
}
