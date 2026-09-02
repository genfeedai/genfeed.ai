export interface IAgentWizardFormData {
  label: string;
  agentType: string;
  autonomyMode: string;
  brand: string;
  topics: string;
  platforms: string[];
  runFrequency: string;
  dailyCreditBudget: number;
  minCreditThreshold: number;
  autoPublishConfidenceThreshold: number;
  qualityTier?: 'budget' | 'balanced' | 'high_quality';
  model?: string;
  voice?: string;
  startImmediately: boolean;
}
