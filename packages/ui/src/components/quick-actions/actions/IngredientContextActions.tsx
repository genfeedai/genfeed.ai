'use client';

import type { AssetScope } from '@genfeedai/enums';
import { DropdownDirection } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IIngredient } from '@genfeedai/interfaces';
import DropdownPrompt from '@ui/dropdowns/prompt/DropdownPrompt';
import DropdownScope from '@ui/dropdowns/scope/DropdownScope';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';

type IngredientContextActionsProps = {
  contextActions: { id: string }[];
  selectedIngredient: IIngredient;
  onCopy?: (ingredient: IIngredient) => void;
  onReprompt?: (ingredient: IIngredient) => void;
  onRefresh?: () => void;
  onScopeChange?: (scope: AssetScope, updatedItem?: IIngredient) => void;
  dropdownButtonClassName: string;
  sharedShellClassName: string;
};

export default function IngredientContextActions({
  contextActions,
  selectedIngredient,
  onCopy,
  onReprompt,
  onRefresh,
  onScopeChange,
  dropdownButtonClassName,
  sharedShellClassName,
}: IngredientContextActionsProps): React.ReactNode {
  return (
    <div
      data-testid="context-actions-group"
      className={cn(sharedShellClassName, 'flex items-center gap-1')}
    >
      {contextActions.some((action) => action.id === 'prompt') && (
        <DropdownPrompt
          promptText={selectedIngredient.promptText ?? ''}
          direction={DropdownDirection.UP}
          className={dropdownButtonClassName}
          onCopy={() => {
            if (onCopy) {
              onCopy(selectedIngredient);
            }
          }}
          onReprompt={
            onReprompt ? () => onReprompt(selectedIngredient) : undefined
          }
        />
      )}

      {contextActions.some((action) => action.id === 'status') && (
        <DropdownStatus
          entity={selectedIngredient}
          onStatusChange={onRefresh}
          className={dropdownButtonClassName}
          position="bottom-full"
        />
      )}

      {contextActions.some((action) => action.id === 'scope') && (
        <DropdownScope
          item={selectedIngredient}
          className={dropdownButtonClassName}
          position="bottom-full"
          onScopeChange={(scope, updatedItem) => {
            onScopeChange?.(scope, updatedItem as IIngredient);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}
