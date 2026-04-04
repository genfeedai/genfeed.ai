export interface TextareaLabelActionsProps {
  label: string;
  onCopy: () => void;
  onEnhance: () => void;
  onUndo?: () => void;
  isCopyDisabled?: boolean;
  isEnhanceDisabled?: boolean;
  isEnhancing?: boolean;
  showUndo?: boolean;
  copyTooltip?: string;
  enhanceTooltip?: string;
  undoTooltip?: string;
  cost?: number;
  isRequired?: boolean;
}
