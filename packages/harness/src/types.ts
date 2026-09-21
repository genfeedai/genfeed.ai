export type ContentObjective =
  | 'authority'
  | 'awareness'
  | 'conversion'
  | 'engagement'
  | 'retention';

export type ContentKind =
  | 'ad-creative'
  | 'article'
  | 'email'
  | 'image'
  | 'newsletter'
  | 'post'
  | 'reply'
  | 'script'
  | 'thread'
  | 'ugc'
  | 'video'
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
  brandOsRevisionId?: string;
  /** Harness profile whose contribution shaped this brief, for receipts. */
  harnessProfileId?: string;
  identityContribution?: ContentHarnessContribution;
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

export type ContentHarnessReceipts = (
  | { brandOs: 'none' }
  | { brandOs: 'approved'; brandOsRevisionId: string }
) & {
  /** Present when a brand harness profile contributed to the brief. */
  harnessProfileId?: string;
};

/**
 * Lifecycle of a configured external pack specifier. Only `loaded` counts as
 * activated; every other state means the runtime fell back to built-in packs.
 */
export type ContentHarnessPackActivationState =
  | 'invalid'
  | 'load_failed'
  | 'loaded'
  | 'unresolvable';

export interface ContentHarnessPackActivation {
  specifier: string;
  state: ContentHarnessPackActivationState;
  packId?: string;
  packVersion?: string;
  error?: string;
}

export interface ContentHarnessActivationReport {
  builtInPackIds: string[];
  external: ContentHarnessPackActivation[];
  loadedPackIds: string[];
}

export interface ContentHarnessBrief {
  receipts?: ContentHarnessReceipts;
  /** Every registered pack, whether or not it contributed to this brief. */
  packs: string[];
  /** Packs whose contribution added at least one directive or source. */
  appliedPacks: string[];
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
