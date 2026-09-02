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
