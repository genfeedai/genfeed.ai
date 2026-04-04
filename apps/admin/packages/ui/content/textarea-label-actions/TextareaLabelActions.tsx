import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { TextareaLabelActionsProps } from '@props/ui/forms/textarea-label-actions.props';
import Button from '@ui/buttons/base/Button';
import Spinner from '@ui/feedback/spinner/Spinner';
import {
  HiArrowUturnLeft,
  HiDocumentDuplicate,
  HiSparkles,
} from 'react-icons/hi2';

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
          icon={<HiDocumentDuplicate className="w-3.5 h-3.5" />}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="h-6 min-h-6 px-1.5"
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
              <HiSparkles className="w-3.5 h-3.5" />
            )
          }
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="h-6 min-h-6 px-1.5"
          tooltip={enhanceTooltip}
          tooltipPosition="top"
          onClick={onEnhance}
          isDisabled={isEnhanceDisabled || isEnhancing}
        />

        {showUndo && onUndo && (
          <Button
            icon={<HiArrowUturnLeft className="w-3.5 h-3.5" />}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            className="h-6 min-h-6 px-1.5 text-warning"
            tooltip={undoTooltip}
            tooltipPosition="top"
            onClick={onUndo}
          />
        )}
      </div>
    </div>
  );
}
