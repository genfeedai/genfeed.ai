import type { AiActionType, ButtonSize, ButtonVariant } from '@genfeedai/enums';

export interface AiActionButtonProps {
  action: AiActionType;
  content: string;
  context?: Record<string, string>;
  onResult: (result: string) => void;
  onUndo?: () => void;
  label?: string;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isDisabled?: boolean;
  tooltip?: string;
}

export interface AiActionGroupProps {
  actions: AiActionType[];
  content: string;
  context?: Record<string, string>;
  onResult: (action: AiActionType, result: string) => void;
  className?: string;
  isDisabled?: boolean;
}
