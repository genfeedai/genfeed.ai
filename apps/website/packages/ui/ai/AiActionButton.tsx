'use client';

import {
  AI_ACTION_DESCRIPTIONS,
  AI_ACTION_LABELS,
  type AiActionType,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import { useAiAction } from '@hooks/ai/use-ai-action';
import Button from '@ui/buttons/base/Button';
import Spinner from '@ui/feedback/spinner/Spinner';
import { useCallback } from 'react';
import { HiArrowUturnLeft, HiSparkles } from 'react-icons/hi2';

interface AiActionButtonProps {
  action: AiActionType;
  content: string;
  context?: Record<string, string>;
  onResult: (result: string) => void;
  orgId: string;
  token: string;
  label?: string;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isDisabled?: boolean;
  tooltip?: string;
  showUndo?: boolean;
  onUndo?: () => void;
}

export default function AiActionButton({
  action,
  content,
  context,
  onResult,
  orgId,
  token,
  label,
  className = '',
  variant = ButtonVariant.GHOST,
  size = ButtonSize.XS,
  isDisabled = false,
  tooltip,
  showUndo = false,
  onUndo,
}: AiActionButtonProps) {
  const { execute, isLoading, previousValue, undo } = useAiAction(action, {
    orgId,
    token,
  });
  const resolvedLabel = label ?? AI_ACTION_LABELS[action];
  const resolvedTooltip = tooltip ?? AI_ACTION_DESCRIPTIONS[action];

  const handleClick = useCallback(async () => {
    const result = await execute(content, context);
    if (result) {
      onResult(result);
    }
  }, [content, context, execute, onResult]);

  const handleUndo = useCallback(() => {
    if (previousValue !== null) {
      onResult(previousValue);
      undo();
      onUndo?.();
    }
  }, [previousValue, undo, onResult, onUndo]);

  return (
    <div className="inline-flex items-center gap-1">
      <Button
        label={isLoading ? '' : resolvedLabel}
        icon={
          isLoading ? (
            <Spinner size={ComponentSize.XS} />
          ) : (
            <HiSparkles className="w-3.5 h-3.5" />
          )
        }
        variant={variant}
        size={size}
        className={className}
        isDisabled={isDisabled || isLoading || !content}
        tooltip={resolvedTooltip}
        tooltipPosition="top"
        onClick={handleClick}
      />

      {showUndo && previousValue !== null && !isLoading && (
        <Button
          icon={<HiArrowUturnLeft className="w-3 h-3" />}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          tooltip="Undo"
          tooltipPosition="top"
          onClick={handleUndo}
        />
      )}
    </div>
  );
}
