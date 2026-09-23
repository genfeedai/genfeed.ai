export interface BrandFormFieldsProps {
  brandName: string;
  step: number;
  canContinue: boolean;
  targetAudience: string;
  tone: string;
  websiteUrl: string;
  errorMessage: string | null;
  submitting: boolean;
  onBrandNameChange: (value: string) => void;
  onBack: () => void;
  onTargetAudienceChange: (value: string) => void;
  onToneChange: (value: string) => void;
  onWebsiteUrlChange: (value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}

export interface ChipOption {
  label: string;
  value: string;
}

export interface BrandStepHeaderProps {
  step: number;
}
