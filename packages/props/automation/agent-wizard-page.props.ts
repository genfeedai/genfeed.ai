export interface AgentWizardPageProps {
  isEmbedded?: boolean;
  onCreated?: () => Promise<void> | void;
}
