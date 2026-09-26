export interface BrandWebsitePromptProps {
  websiteUrl: string;
  submitting: boolean;
  errorMessage: string | null;
  onWebsiteUrlChange: (value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}
