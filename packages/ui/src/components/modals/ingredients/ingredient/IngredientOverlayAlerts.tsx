import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';

type Props = {
  error: string | null;
  localIngredient: IIngredient;
  viewingChild: IIngredient | null;
  onBackToParent: () => void;
};

export default function IngredientOverlayAlerts({
  error,
  localIngredient,
  viewingChild,
  onBackToParent,
}: Props) {
  return (
    <>
      {error ? (
        <Alert type={AlertCategory.ERROR}>
          <p>{error}</p>
        </Alert>
      ) : null}

      {localIngredient.status === IngredientStatus.ARCHIVED && (
        <Alert type={AlertCategory.WARNING}>
          <p>This ingredient is archived.</p>
        </Alert>
      )}

      {EnvironmentService.isDevelopment && (
        <Alert type={AlertCategory.INFO}>
          <p>Ingredient ID: {localIngredient.id}</p>
        </Alert>
      )}

      {viewingChild &&
        (() => {
          const childMetadata =
            typeof viewingChild.metadata === 'object' && viewingChild.metadata
              ? (viewingChild.metadata as IMetadata)
              : null;

          return (
            <Alert type={AlertCategory.INFO}>
              <div className="flex justify-between items-center w-full gap-2">
                <p>Viewing child: {childMetadata?.label || 'Child Asset'}</p>

                <Button
                  label="Back to parent"
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                  onClick={onBackToParent}
                />
              </div>
            </Alert>
          );
        })()}
    </>
  );
}
