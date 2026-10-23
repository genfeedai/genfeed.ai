import {
  BRAND_KIT_ASSET_FIELD_KEYS,
  type BrandKitAssetImportStatus,
  type BrandKitAssetRole,
  type BrandKitFieldGroup,
  type BrandKitFieldKey,
  type IBrandKitApplyResult,
  type IBrandKitAssetImportResponse,
  type IBrandKitAssetValue,
  type IBrandKitDiagnostic,
  type IBrandKitDraft,
  type IBrandKitDraftField,
} from '@genfeedai/contracts/interfaces';
import type {
  BrandKitFieldValues,
  BrandKitSocialProposal,
  EvidenceKind,
} from '@props/pages/brand-kit-review.props';

/** Readable field inside the scan strip — light surface, not invisible ghost. */
export const INLINE_INPUT_CLASSNAME =
  'h-8 border-0 bg-transparent px-2.5 text-sm text-foreground shadow-none placeholder:text-muted-foreground/80 focus-visible:border-0 focus-visible:ring-0';

export const FIELD_GROUP_LABELS: Record<BrandKitFieldGroup, string> = {
  assets: 'Assets',
  links: 'Links',
  profile: 'Profile',
  strategy: 'Strategy',
  visual: 'Visual',
  voice: 'Voice',
};

export const FIELD_GROUP_ORDER: readonly BrandKitFieldGroup[] = [
  'profile',
  'visual',
  'voice',
  'strategy',
  'links',
  'assets',
];

export const DEFERRED_REVIEW_FIELDS = new Set<BrandKitFieldKey>([
  'banner',
  'references',
]);
const STRUCTURED_APPLY_FIELDS = new Set<BrandKitFieldKey>([
  'logo',
  'socialLinks',
]);

/** Asset-valued fields are reviewed as pictures and land through asset import. */
export const ASSET_FIELDS = new Set<BrandKitFieldKey>(
  BRAND_KIT_ASSET_FIELD_KEYS,
);

export const ASSET_ROLE_ORDER: readonly BrandKitAssetRole[] = [
  'logo',
  'banner',
  'reference',
];

export const ASSET_ROLE_LABELS: Record<BrandKitAssetRole, string> = {
  banner: 'Banner',
  logo: 'Logo',
  reference: 'References',
};

export const ASSET_IMPORT_STATUS_LABELS: Record<
  BrandKitAssetImportStatus,
  string
> = {
  failed: 'Import failed',
  imported: 'Imported',
  skipped: 'Skipped',
};

export const BRAND_KIT_REVIEW_COPY = {
  assetCandidates: 'Asset Candidates',
  assetSelectionHint: 'Click an image to select it for import.',
  current: 'Current',
  diagnostics: 'Diagnostics',
  noDraft: 'No brand kit draft yet',
  proposed: 'Proposed',
} as const;

export const COLOR_FIELD_KEYS = new Set<BrandKitFieldKey>([
  'backgroundColor',
  'primaryColor',
  'secondaryColor',
]);

export const EVIDENCE_KIND_CLASSNAMES: Record<EvidenceKind, string> = {
  candidate: 'bg-warning/10 text-warning',
  extracted: 'bg-success/10 text-success',
  inferred: 'bg-info/10 text-info',
  missing: 'bg-destructive/10 text-destructive',
};

const STRING_LIST_FIELDS = new Set<BrandKitFieldKey>([
  'strategyContentTypes',
  'strategyGoals',
  'strategyPlatforms',
  'voiceAudience',
  'voiceDoNotSoundLike',
  'voiceMessagingPillars',
  'voiceValues',
]);

export function formatAppliedFieldsSummary(
  result: IBrandKitApplyResult,
): string {
  return `Applied ${result.appliedFields.length} fields; preserved ${result.preservedFields.length}. Status: ${result.status}.`;
}

export function formatConfidence(
  confidence: number | undefined,
): string | null {
  if (!confidence) {
    return null;
  }

  return `Confidence: ${Math.round(confidence * 100)}%`;
}

export function showsScoredKind(
  kind: EvidenceKind,
  confidence: number | undefined,
): boolean {
  return Boolean(confidence) && (kind === 'extracted' || kind === 'inferred');
}

export function getFieldEvidenceKind(
  key: BrandKitFieldKey,
  field: IBrandKitDraftField,
): EvidenceKind {
  if (!hasProposedValue(field)) {
    return 'missing';
  }

  if (COLOR_FIELD_KEYS.has(key)) {
    return 'candidate';
  }

  if (field.evidence.some((evidence) => evidence.sourceType !== 'system')) {
    return 'extracted';
  }

  return 'inferred';
}

export function formatDraftPrompt(brandLabel: string): string {
  return `Enter a website URL and scan to load proposed fields for ${brandLabel}.`;
}

export function formatMissingFields(fields: readonly string[]): string {
  return `Missing: ${fields.join(', ')}`;
}

export function formatReadinessScore(score: number): string {
  return `${score}% readiness`;
}

export function formatSelectedAssetCount(count: number): string {
  return `${count} ${count === 1 ? 'asset' : 'assets'} selected.`;
}

export function formatSelectedFieldSummary(count: number): string {
  if (count === 0) {
    return 'No fields selected. Empty proposals stay off the brand kit.';
  }

  return `${count} ${count === 1 ? 'field' : 'fields'} selected. Applying writes them onto the brand kit.`;
}

function hasObjectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatBrandKitObject(value: Record<string, unknown>): string {
  const label = typeof value.label === 'string' ? value.label : '';
  const url = typeof value.url === 'string' ? value.url : '';
  const platform = typeof value.platform === 'string' ? value.platform : '';
  const role = typeof value.role === 'string' ? value.role : '';
  const dimensions =
    typeof value.width === 'number' && typeof value.height === 'number'
      ? `${value.width}x${value.height}`
      : '';

  return [label, platform, role, dimensions, url].filter(Boolean).join(' ');
}

export function formatBrandKitValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        hasObjectValue(entry) ? formatBrandKitObject(entry) : String(entry),
      )
      .filter(Boolean)
      .join('\n');
  }

  if (hasObjectValue(value)) {
    return formatBrandKitObject(value);
  }

  return String(value);
}

function isAssetValue(value: unknown): value is IBrandKitAssetValue {
  return hasObjectValue(value) && typeof value.role === 'string';
}

export function toAssetValues(value: unknown): IBrandKitAssetValue[] {
  if (Array.isArray(value)) {
    return value.filter(isAssetValue);
  }

  return isAssetValue(value) ? [value] : [];
}

export function parseEditableValue(key: BrandKitFieldKey, value: string) {
  if (!STRING_LIST_FIELDS.has(key)) {
    return value.trim();
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseSocialUrls(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function readSocialProposals(value: unknown): BrandKitSocialProposal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!hasObjectValue(entry)) {
      return [];
    }
    const platform = typeof entry.platform === 'string' ? entry.platform : '';
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (!platform || !url) {
      return [];
    }
    return [{ platform, url }];
  });
}

function socialLinkIdentity(platform: string, url: string): string {
  return `${platform.trim().toLowerCase()}\n${url.trim()}`;
}

function rejectedSocialLinks(
  submitted: unknown,
  saved: readonly BrandKitSocialProposal[],
): unknown[] {
  if (!Array.isArray(submitted)) {
    return [];
  }

  const savedKeys = new Set(
    saved.map((link) => socialLinkIdentity(link.platform, link.url)),
  );
  return submitted.filter((entry) => {
    if (
      !hasObjectValue(entry) ||
      typeof entry.platform !== 'string' ||
      typeof entry.url !== 'string'
    ) {
      return false;
    }
    return !savedKeys.has(socialLinkIdentity(entry.platform, entry.url));
  });
}

export function nextAppliedField(
  key: BrandKitFieldKey,
  field: IBrandKitDraftField,
  sent: unknown,
  result: IBrandKitApplyResult,
): IBrandKitDraftField | undefined {
  if (key !== 'socialLinks') {
    return {
      ...field,
      currentValue: sent,
      proposedValue: undefined,
    };
  }

  const saved = readSocialProposals(result.appliedValues?.socialLinks);
  if (saved.length === 0) {
    return undefined;
  }

  const rejected = rejectedSocialLinks(sent, saved);
  return {
    ...field,
    currentValue: result.appliedValues?.socialLinks ?? saved,
    proposedValue: rejected.length > 0 ? rejected : undefined,
  };
}

export function hasMeaningfulBrandKitValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some(hasMeaningfulBrandKitValue);
  }

  if (hasObjectValue(value)) {
    if ('url' in value || 'platform' in value || 'role' in value) {
      return typeof value.url === 'string' && value.url.trim().length > 0;
    }
    return Object.values(value).some(hasMeaningfulBrandKitValue);
  }

  return false;
}

export function hasProposedValue(field: IBrandKitDraftField): boolean {
  return hasMeaningfulBrandKitValue(field.proposedValue);
}

export function readApplyValue(
  key: BrandKitFieldKey,
  field: IBrandKitDraftField,
  fieldValues: BrandKitFieldValues,
): unknown {
  if (STRUCTURED_APPLY_FIELDS.has(key)) {
    return field.proposedValue;
  }

  return parseEditableValue(key, fieldValues[key] ?? '');
}

export function canApplyField(
  key: BrandKitFieldKey,
  field: IBrandKitDraftField,
) {
  return hasProposedValue(field) && !DEFERRED_REVIEW_FIELDS.has(key);
}

export function getDiagnostics(
  draft: IBrandKitDraft | null,
  applyResult: IBrandKitApplyResult | null,
  assetImportResult: IBrandKitAssetImportResponse | null,
): IBrandKitDiagnostic[] {
  return [
    ...(draft?.diagnostics ?? []),
    ...(draft?.readiness.diagnostics ?? []),
    ...(applyResult?.diagnostics ?? []),
    ...(assetImportResult?.diagnostics ?? []),
  ];
}
