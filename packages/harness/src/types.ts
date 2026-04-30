export type ContentObjective =
  | 'authority'
  | 'awareness'
  | 'conversion'
  | 'engagement'
  | 'retention';

export type ContentKind =
  | 'article'
  | 'email'
  | 'newsletter'
  | 'post'
  | 'reply'
  | 'script'
  | 'thread'
  | 'video-script';

export type HarnessRecordKind =
  | 'anti_example'
  | 'audience_signal'
  | 'brand_example'
  | 'brand_voice'
  | 'evaluation_rubric'
  | 'performance_winner'
  | 'persona_signal';

export interface HarnessVoiceProfile {
  tone?: string;
  style?: string;
  audience?: string[];
  values?: string[];
  taglines?: string[];
  hashtags?: string[];
  messagingPillars?: string[];
  doNotSoundLike?: string[];
  sampleOutput?: string;
}

export interface HarnessPersonaProfile {
  label?: string;
  bio?: string;
  voice?: string;
  platforms?: string[];
  topics?: string[];
  formats?: string[];
}

export interface ContentHarnessIntent {
  platform?: string;
  contentType: ContentKind;
  objective: ContentObjective;
  topic?: string;
  offer?: string;
  audienceHint?: string;
  campaignId?: string;
}

export interface HarnessSourceRecord {
  id: string;
  kind: HarnessRecordKind;
  content: string;
  source?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface ContentHarnessInput {
  organizationId?: string;
  brandId?: string;
  brandName?: string;
  intent: ContentHarnessIntent;
  voiceProfile?: HarnessVoiceProfile;
  personaProfile?: HarnessPersonaProfile;
  profileContribution?: ContentHarnessContribution;
  sources?: HarnessSourceRecord[];
  metadata?: Record<string, unknown>;
}

export interface ContentHarnessContribution {
  systemDirectives?: string[];
  styleDirectives?: string[];
  guardrails?: string[];
  evaluationCriteria?: string[];
  providerHints?: string[];
  sources?: HarnessSourceRecord[];
}

export interface ContentHarnessBrief {
  packs: string[];
  systemDirectives: string[];
  styleDirectives: string[];
  guardrails: string[];
  evaluationCriteria: string[];
  providerHints: string[];
  sources: HarnessSourceRecord[];
  metadata: {
    brandId?: string;
    brandName?: string;
    contentType: ContentKind;
    objective: ContentObjective;
    platform?: string;
  };
}

export interface ContentHarnessPack {
  id: string;
  version: string;
  description?: string;
  capabilities?: string[];
  contribute?:
    | ((
        input: ContentHarnessInput,
      ) => ContentHarnessContribution | Promise<ContentHarnessContribution>)
    | undefined;
}
