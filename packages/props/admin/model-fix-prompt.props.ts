/** A prompt the browser would not copy, shown as text to copy by hand. */
export interface ModelFixPromptFallback {
  text: string;
  title: string;
}

export interface ModelFixPromptFallbackDialogProps {
  fallback: ModelFixPromptFallback | null;
  onClose: () => void;
}

export interface ModelPricingAttentionPanelProps {
  onCopyFixPrompt: () => void;
}
