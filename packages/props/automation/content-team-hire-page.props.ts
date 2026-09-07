export interface ContentTeamHirePageProps {
  isEmbedded?: boolean;
  onCancel?: () => void;
  onCreated?: () => Promise<void> | void;
}
