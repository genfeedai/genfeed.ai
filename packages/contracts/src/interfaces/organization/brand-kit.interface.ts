import type { ReferenceImageCategory } from '../..';
import type { IBrandAgentStrategy, IBrandAgentVoice } from './brand.interface';

export type BrandKitDraftStatus =
  | 'ready'
  | 'partial'
  | 'missing'
  | 'blocked'
  | 'accepted'
  | 'discarded';

export type BrandKitReadinessStatus =
  | 'complete'
  | 'partial'
  | 'blocked'
  | 'missing';

export type BrandKitFieldGroup =
  | 'profile'
  | 'visual'
  | 'voice'
  | 'strategy'
  | 'links'
  | 'assets';

export type BrandKitSourceType =
  | 'current_brand'
  | 'website'
  | 'manual'
  | 'uploaded_guidance'
  | 'system';

export type BrandKitAssetRole = 'logo' | 'banner' | 'reference';

export type BrandKitApplyAction = 'accept' | 'reject' | 'preserve';

export type BrandKitDiagnosticSeverity = 'info' | 'warning' | 'error';

export type BrandKitFieldKey =
  | 'label'
  | 'description'
  | 'primaryColor'
  | 'secondaryColor'
  | 'backgroundColor'
  | 'fontFamily'
  | 'promptGuidelines'
  | 'voiceTone'
  | 'voiceStyle'
  | 'voiceAudience'
  | 'voiceValues'
  | 'voiceMessagingPillars'
  | 'voiceDoNotSoundLike'
  | 'voiceSampleOutput'
  | 'strategyContentTypes'
  | 'strategyPlatforms'
  | 'strategyGoals'
  | 'strategyFrequency'
  | 'socialLinks'
  | 'logo'
  | 'banner'
  | 'references';

export type BrandKitFieldOwnerPath =
  | 'brand.label'
  | 'brand.description'
  | 'brand.primaryColor'
  | 'brand.secondaryColor'
  | 'brand.backgroundColor'
  | 'brand.fontFamily'
  | 'brand.text'
  | 'brand.agentConfig.voice.tone'
  | 'brand.agentConfig.voice.style'
  | 'brand.agentConfig.voice.audience'
  | 'brand.agentConfig.voice.values'
  | 'brand.agentConfig.voice.messagingPillars'
  | 'brand.agentConfig.voice.doNotSoundLike'
  | 'brand.agentConfig.voice.sampleOutput'
  | 'brand.agentConfig.strategy.contentTypes'
  | 'brand.agentConfig.strategy.platforms'
  | 'brand.agentConfig.strategy.goals'
  | 'brand.agentConfig.strategy.frequency'
  | 'brand.links'
  | 'brand.logo'
  | 'brand.banner'
  | 'brand.references';

export interface IBrandKitFieldOwner {
  key: BrandKitFieldKey;
  label: string;
  group: BrandKitFieldGroup;
  ownerPath: BrandKitFieldOwnerPath;
  valueKind: 'string' | 'string[]' | 'socialLinks' | 'asset' | 'asset[]';
  applyActionDefault: BrandKitApplyAction;
}

export interface IBrandKitSourceEvidence {
  sourceType: BrandKitSourceType;
  label: string;
  sourceId?: string;
  url?: string;
  excerpt?: string;
  confidence?: number;
}

export interface IBrandKitDiagnostic {
  code: string;
  severity: BrandKitDiagnosticSeverity;
  message: string;
  fieldKey?: BrandKitFieldKey;
}

export interface IBrandKitSocialLink {
  platform: string;
  url: string;
  label?: string;
  sourceType: BrandKitSourceType;
}

export interface IBrandKitAssetValue {
  role: BrandKitAssetRole;
  referenceCategory?: ReferenceImageCategory;
  id?: string;
  url?: string;
  label?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sourceType: BrandKitSourceType;
}

export interface IBrandKitAssetCandidate extends IBrandKitAssetValue {
  candidateId: string;
  sourceUrl?: string;
  diagnostics?: IBrandKitDiagnostic[];
}

export interface IBrandKitManualAssetInput {
  role: BrandKitAssetRole;
  referenceCategory?: ReferenceImageCategory;
  id?: string;
  url?: string;
  label?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sourceType?: Extract<BrandKitSourceType, 'manual' | 'uploaded_guidance'>;
}

export interface IBrandKitManualInput {
  label?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
  guidanceText?: string;
  guidanceDocumentName?: string;
  voiceTone?: string;
  voiceStyle?: string;
  voiceAudience?: string[];
  voiceValues?: string[];
  voiceMessagingPillars?: string[];
  voiceDoNotSoundLike?: string[];
  voiceSampleOutput?: string;
  strategyContentTypes?: string[];
  strategyPlatforms?: string[];
  strategyGoals?: string[];
  strategyFrequency?: string;
  assets?: IBrandKitManualAssetInput[];
}

export interface IBrandKitDraftField<TValue = unknown> {
  key: BrandKitFieldKey;
  label: string;
  group: BrandKitFieldGroup;
  ownerPath: BrandKitFieldOwnerPath;
  currentValue?: TValue;
  proposedValue?: TValue;
  evidence: IBrandKitSourceEvidence[];
  diagnostics: IBrandKitDiagnostic[];
  confidence?: number;
  applyActionDefault: BrandKitApplyAction;
}

export interface IBrandKitReadiness {
  status: BrandKitReadinessStatus;
  score: number;
  requiredFields: BrandKitFieldKey[];
  missingFields: BrandKitFieldKey[];
  diagnostics: IBrandKitDiagnostic[];
}

/**
 * Brand Kit API resources always expose a JSON:API identity. Drafts use their
 * caller-supplied draft id when present and otherwise fall back to the owning
 * Brand id; operation outcomes use the Brand id. These are transport identities
 * for a read/review projection, not a separate persistence model.
 */
export interface IBrandKitResource {
  id: string;
  brandId: string;
}

export interface IBrandKitDraft extends IBrandKitResource {
  organizationId?: string;
  status: BrandKitDraftStatus;
  sourceType: BrandKitSourceType;
  fields: Partial<Record<BrandKitFieldKey, IBrandKitDraftField>>;
  assetCandidates: IBrandKitAssetCandidate[];
  evidence: IBrandKitSourceEvidence[];
  diagnostics: IBrandKitDiagnostic[];
  readiness: IBrandKitReadiness;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Anonymous Brand OS transport envelope.
 *
 * The draft remains the canonical Brand Kit projection. The opaque bearer
 * token is transport-only and is never copied onto the draft or persisted as
 * a Brand identifier.
 */
export interface IBrandOsPreview {
  id: string;
  draft: IBrandKitDraft;
  expiresAt: string;
  previewToken: string;
}

/** Tenant-bound read model created by claiming an anonymous preview. */
export interface IBrandOsDraftHandoff {
  id: string;
  draft: IBrandKitDraft;
  expiresAt: string;
  status: 'claimed';
}

export interface IBrandOsPreviewRequest {
  guidance?: string;
  url?: string;
}

export interface IBrandOsPreviewClaimRequest {
  previewToken: string;
}

export interface IBrandKitApplyFieldDecisionAccept<TValue = unknown> {
  action: 'accept';
  value?: TValue;
  assetCandidateId?: string;
  replaceExisting?: boolean;
}

export interface IBrandKitApplyFieldDecisionPreserve {
  action: 'preserve';
}

export interface IBrandKitApplyFieldDecisionReject {
  action: 'reject';
}

export type IBrandKitApplyFieldDecision<TValue = unknown> =
  | IBrandKitApplyFieldDecisionAccept<TValue>
  | IBrandKitApplyFieldDecisionPreserve
  | IBrandKitApplyFieldDecisionReject;

export interface IBrandKitApplyRequest {
  brandId: string;
  draftId?: string;
  fields: Partial<Record<BrandKitFieldKey, IBrandKitApplyFieldDecision>>;
}

export interface IBrandKitApplyResult extends IBrandKitResource {
  status: Extract<BrandKitDraftStatus, 'accepted' | 'partial' | 'blocked'>;
  appliedFields: BrandKitFieldKey[];
  preservedFields: BrandKitFieldKey[];
  diagnostics: IBrandKitDiagnostic[];
}

export type BrandKitAssetImportStatus = 'imported' | 'skipped' | 'failed';

export interface IBrandKitAssetImportCandidate {
  candidateId?: string;
  role: BrandKitAssetRole;
  referenceCategory?: ReferenceImageCategory;
  url?: string;
  sourceUrl?: string;
  label?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sourceType?: BrandKitSourceType;
  replaceExisting?: boolean;
}

export interface IBrandKitAssetImportRequest {
  assets: IBrandKitAssetImportCandidate[];
}

export interface IBrandKitAssetImportResult {
  candidateId?: string;
  role: BrandKitAssetRole;
  referenceCategory?: ReferenceImageCategory;
  status: BrandKitAssetImportStatus;
  assetId?: string;
  url?: string;
  diagnostics: IBrandKitDiagnostic[];
}

export interface IBrandKitAssetImportResponse extends IBrandKitResource {
  status: Extract<BrandKitDraftStatus, 'accepted' | 'partial' | 'blocked'>;
  importedAssetIds: string[];
  skippedCandidateIds: string[];
  failedCandidateIds: string[];
  results: IBrandKitAssetImportResult[];
  diagnostics: IBrandKitDiagnostic[];
}

/**
 * A brand asset read back from storage.
 *
 * Logo/banner/reference are `Asset` rows keyed by `parentBrandId` — the Brand
 * table has no logo/banner column — so every consumer that wants a usable URL
 * has to resolve them. This is the shape that resolution returns.
 */
export interface IBrandKitResolvedAsset {
  id: string;
  role: BrandKitAssetRole;
  referenceCategory?: ReferenceImageCategory;
  url: string;
  label?: string;
  mimeType?: string;
}

export interface IBrandKitResolvedAssets {
  logo?: IBrandKitResolvedAsset;
  banner?: IBrandKitResolvedAsset;
  references: IBrandKitResolvedAsset[];
}

/**
 * A brand asset in the shape the brand serializer's asset relations expect.
 *
 * `brandSerializerConfig` declares `logo`/`banner`/`references` as `ASSET_REL`,
 * so a payload attached to a brand has to speak `assetAttributes` rather than
 * the prompt-facing {@link IBrandKitResolvedAsset}. `cdnUrl` carries the
 * absolute URL, which is the field the resolver calls `url`.
 */
export interface IBrandKitAssetRelation {
  id: string;
  category: string;
  cdnUrl: string;
  displayName?: string;
  mimeType?: string;
  referenceCategory?: ReferenceImageCategory;
}

export interface IBrandKitAssetRelations {
  logo?: IBrandKitAssetRelation;
  banner?: IBrandKitAssetRelation;
  references: IBrandKitAssetRelation[];
}

export type IBrandKitVoiceSnapshot = IBrandAgentVoice;

export type IBrandKitStrategySnapshot = IBrandAgentStrategy;

export const BRAND_KIT_FIELD_OWNERSHIP: readonly IBrandKitFieldOwner[] = [
  {
    applyActionDefault: 'preserve',
    group: 'profile',
    key: 'label',
    label: 'Brand name',
    ownerPath: 'brand.label',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'profile',
    key: 'description',
    label: 'Description',
    ownerPath: 'brand.description',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'visual',
    key: 'primaryColor',
    label: 'Primary color',
    ownerPath: 'brand.primaryColor',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'visual',
    key: 'secondaryColor',
    label: 'Secondary color',
    ownerPath: 'brand.secondaryColor',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'visual',
    key: 'backgroundColor',
    label: 'Background color',
    ownerPath: 'brand.backgroundColor',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'visual',
    key: 'fontFamily',
    label: 'Font family',
    ownerPath: 'brand.fontFamily',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'voice',
    key: 'promptGuidelines',
    label: 'Prompt guidelines',
    ownerPath: 'brand.text',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'voice',
    key: 'voiceTone',
    label: 'Voice tone',
    ownerPath: 'brand.agentConfig.voice.tone',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'voice',
    key: 'voiceStyle',
    label: 'Voice style',
    ownerPath: 'brand.agentConfig.voice.style',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'voice',
    key: 'voiceAudience',
    label: 'Voice audience',
    ownerPath: 'brand.agentConfig.voice.audience',
    valueKind: 'string[]',
  },
  {
    applyActionDefault: 'preserve',
    group: 'voice',
    key: 'voiceValues',
    label: 'Voice values',
    ownerPath: 'brand.agentConfig.voice.values',
    valueKind: 'string[]',
  },
  {
    applyActionDefault: 'preserve',
    group: 'voice',
    key: 'voiceMessagingPillars',
    label: 'Messaging pillars',
    ownerPath: 'brand.agentConfig.voice.messagingPillars',
    valueKind: 'string[]',
  },
  {
    applyActionDefault: 'preserve',
    group: 'voice',
    key: 'voiceDoNotSoundLike',
    label: 'Avoid sounding like',
    ownerPath: 'brand.agentConfig.voice.doNotSoundLike',
    valueKind: 'string[]',
  },
  {
    applyActionDefault: 'preserve',
    group: 'voice',
    key: 'voiceSampleOutput',
    label: 'Sample output',
    ownerPath: 'brand.agentConfig.voice.sampleOutput',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'strategy',
    key: 'strategyContentTypes',
    label: 'Content types',
    ownerPath: 'brand.agentConfig.strategy.contentTypes',
    valueKind: 'string[]',
  },
  {
    applyActionDefault: 'preserve',
    group: 'strategy',
    key: 'strategyPlatforms',
    label: 'Platforms',
    ownerPath: 'brand.agentConfig.strategy.platforms',
    valueKind: 'string[]',
  },
  {
    applyActionDefault: 'preserve',
    group: 'strategy',
    key: 'strategyGoals',
    label: 'Goals',
    ownerPath: 'brand.agentConfig.strategy.goals',
    valueKind: 'string[]',
  },
  {
    applyActionDefault: 'preserve',
    group: 'strategy',
    key: 'strategyFrequency',
    label: 'Posting frequency',
    ownerPath: 'brand.agentConfig.strategy.frequency',
    valueKind: 'string',
  },
  {
    applyActionDefault: 'preserve',
    group: 'links',
    key: 'socialLinks',
    label: 'Social links',
    ownerPath: 'brand.links',
    valueKind: 'socialLinks',
  },
  {
    applyActionDefault: 'preserve',
    group: 'assets',
    key: 'logo',
    label: 'Logo',
    ownerPath: 'brand.logo',
    valueKind: 'asset',
  },
  {
    applyActionDefault: 'preserve',
    group: 'assets',
    key: 'banner',
    label: 'Banner',
    ownerPath: 'brand.banner',
    valueKind: 'asset',
  },
  {
    applyActionDefault: 'preserve',
    group: 'assets',
    key: 'references',
    label: 'Reference assets',
    ownerPath: 'brand.references',
    valueKind: 'asset[]',
  },
];

/**
 * `asset` vs `asset[]` records cardinality, not picture-ness — a brand owns one
 * logo and one banner but many references, exactly like `string` vs `string[]`.
 * Consumers that only care whether a field holds pictures ask this instead of
 * re-deriving the union at every call site.
 */
export const BRAND_KIT_ASSET_FIELD_KEYS: readonly BrandKitFieldKey[] =
  BRAND_KIT_FIELD_OWNERSHIP.filter(
    (owner) => owner.valueKind === 'asset' || owner.valueKind === 'asset[]',
  ).map((owner) => owner.key);
