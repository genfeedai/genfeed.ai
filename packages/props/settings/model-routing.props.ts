export type EnabledModelOption = {
  label: string;
  value: string;
};

export type AdvancedRoutingCardProps = {
  allowAdvancedOverrides: boolean;
  generationModelOverride: string;
  modelOptions: EnabledModelOption[];
  isSaving: boolean;
  onAllowAdvancedOverridesChange: (checked: boolean) => void;
  onGenerationModelOverrideChange: (value: string) => void;
  onReviewModelOverrideChange: (value: string) => void;
  onThinkingModelOverrideChange: (value: string) => void;
  reviewModelOverride: string;
  thinkingModelOverride: string;
};
