import type { IBrandVoiceCorpusSummary } from './brand-voice-corpus.interface';

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
  /** The own-writing evidence this profile was drafted from. */
  corpus: IBrandVoiceCorpusSummary;
  doNotSoundLike: string[];
  /** Verbatim lines from the corpus — never model-written text. */
  exemplarTexts: string[];
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
  /** Measured-style rules plus evidence-backed rules from the model. */
  writingRules: string[];
}
