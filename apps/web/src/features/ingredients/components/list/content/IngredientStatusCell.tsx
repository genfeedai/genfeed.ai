import type { IIngredient } from '@genfeedai/contracts/interfaces';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import { hoverRevealClassName } from '@ui/styles/hover-reveal';
import IngredientReviewActions from '@/components/ingredients/IngredientReviewActions';
import LibraryReviewBadge from '@/features/library/review/library-review-badge';

interface IngredientStatusCellProps {
  ingredient: IIngredient;
  isActionsEnabled: boolean;
  onUpdated: (ingredient: IIngredient) => void;
}

export default function IngredientStatusCell({
  ingredient,
  isActionsEnabled,
  onUpdated,
}: IngredientStatusCellProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <LibraryReviewBadge state={ingredient.reviewState} />
      <DropdownStatus
        entity={ingredient}
        onStatusChange={(_newStatus, updatedIngredient) => {
          if (updatedIngredient) {
            onUpdated(updatedIngredient as IIngredient);
          }
        }}
      />
      {isActionsEnabled ? (
        // Approve/reject are row actions: shown on row hover or focus.
        <div className={hoverRevealClassName({ at: 'lg' })}>
          <IngredientReviewActions
            ingredient={ingredient}
            onUpdated={onUpdated}
          />
        </div>
      ) : null}
    </div>
  );
}
