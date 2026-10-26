export interface PromptBarEnhanceControlsLabels {
  cancelAria: string;
  enhanceAria: string;
  enhanceLabel: string;
  undoAria: string;
  undoLabel: string;
}

export interface PromptBarEnhanceControlsProps {
  /** Nothing to enhance yet (empty prompt); never disables Cancel. */
  isDisabled?: boolean;
  isEnhancing: boolean;
  labels: PromptBarEnhanceControlsLabels;
  onCancel: () => void;
  onEnhance: () => void;
  /** Present only while the last enhancement can still be undone. */
  onUndo?: () => void;
}
