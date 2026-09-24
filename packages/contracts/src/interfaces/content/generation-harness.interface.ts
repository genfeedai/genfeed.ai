export interface GenerationHarnessSettings {
  organizationEnabled: boolean | null;
  brandEnabled: boolean | null;
  brandId?: string;
  isEnabled: boolean;
  source: 'default' | 'organization' | 'brand';
}

export interface UpdateGenerationHarnessSettings {
  scope: 'organization' | 'brand';
  brandId?: string;
  isEnabled: boolean | null;
}

export interface GenerationHarnessReceipt {
  originalPrompt: string;
  enhancedPrompt: string;
  status: 'applied' | 'skipped';
  source: 'default' | 'organization' | 'brand' | 'request';
  brandId: string;
  appliedPacks: Array<{ id: string; version: string }>;
}
