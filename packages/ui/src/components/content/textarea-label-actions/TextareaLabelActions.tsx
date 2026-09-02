import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type { TextareaLabelActionsProps } from '@genfeedai/props/ui/forms/textarea-label-actions.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Copy, Sparkles, Undo2 } from 'lucide-react';

export default function TextareaLabelActions({
  label,
  onCopy,
  onEnhance,
  onUndo,
  isCopyDisabled = false,
  isEnhanceDisabled = false,
  isEnhancing = false,
  showUndo = false,
  copyTooltip = 'Copy prompt',
  enhanceTooltip = 'Enhance prompt',
  undoTooltip = 'Undo enhancement',
  isRequired = false,
}: TextareaLabelActionsProps) {
  return (
    <div className="flex items-center justify-between w-full">
      <span>
        {label}
        {isRequired && <span className="text-error ml-1">*</span>}
      </span>

      <div className="flex items-center gap-2">
        <Button
          icon={<Copy className="size-3.5" />}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.MICRO}
          tooltip={copyTooltip}
          tooltipPosition="top"
          onClick={onCopy}
          isDisabled={isCopyDisabled}
        />

        <Button
          icon={
            isEnhancing ? (
              <Spinner size={ComponentSize.XS} />
            ) : (
              <Sparkles className="size-3.5" />
            )
          }
          variant={ButtonVariant.GHOST}
          size={ButtonSize.MICRO}
          tooltip={enhanceTooltip}
          tooltipPosition="top"
          onClick={onEnhance}
          isDisabled={isEnhanceDisabled || isEnhancing}
        />

        {showUndo && onUndo && (
          <Button
            icon={<Undo2 className="size-3.5" />}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.MICRO}
            className="text-muted-foreground"
            tooltip={undoTooltip}
            tooltipPosition="top"
            onClick={onUndo}
          />
        )}
      </div>
    </div>
  );
}
