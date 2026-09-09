export interface AgentMarketplaceProps {
  isSubmitting: boolean;
  onActivate: (presetId: string) => Promise<void> | void;
  submittingPresetId: string | null;
}
