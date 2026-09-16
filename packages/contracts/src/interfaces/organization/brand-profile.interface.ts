import type { BrandProfileGenerationFailureReason } from '../../enums/brand-profile-generation.enum';

export type BrandPromptIntent = 'analyze' | 'create' | 'plan';

export interface IBrandPromptSeed {
  angle: string;
  audience: string;
  preferredFormats: string[];
  topic: string;
}

export interface IBrandConversationStarter {
  id: string;
  intent: BrandPromptIntent;
  label: string;
  prompt: string;
  topic: string;
}

export interface IBrandAgentPrompting {
  conversationStarters: IBrandConversationStarter[];
  seeds: IBrandPromptSeed[];
}

export interface IGeneratedBrandProfile {
  audience: string[];
  doNotSoundLike: string[];
  hashtags: string[];
  messagingPillars: string[];
  prompting: IBrandAgentPrompting;
  sampleOutput: string;
  strategy: {
    goals: string[];
    topics: string[];
  };
  style: string;
  taglines: string[];
  tone: string;
  values: string[];
}

/**
 * Redacted diagnostics for a generated brand profile that failed validation.
 * Bounded by design: never includes the provider payload, only its shape.
 */
export interface IBrandProfileGenerationDiagnostics {
  isRetryable: boolean;
  missingFields: string[];
  outputLength: number;
  reason: BrandProfileGenerationFailureReason;
}
