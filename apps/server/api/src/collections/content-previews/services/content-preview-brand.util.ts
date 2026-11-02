import type {
  BrandKitFieldKey,
  IBrandKitDraft,
  IPublicContentPreviewBrand,
  IWarmupPreparation,
} from '@genfeedai/contracts/interfaces';
import { readRecord, readString } from '@genfeedai/utils/data/extract.util';

/** Brand values a preview may show, read from the brand record. */
export interface ContentPreviewBrandSource {
  label: string;
  description?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  agentConfig?: unknown;
}

type PreviewBrandField = Exclude<
  keyof IPublicContentPreviewBrand,
  'name' | 'logoUrl'
>;

const PREVIEW_FIELD_KEYS: Record<PreviewBrandField, BrandKitFieldKey> = {
  audience: 'voiceAudience',
  description: 'description',
  messagingPillars: 'voiceMessagingPillars',
  primaryColor: 'primaryColor',
  secondaryColor: 'secondaryColor',
  style: 'voiceStyle',
  tone: 'voiceTone',
  values: 'voiceValues',
};

function readList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Fields the operator accepted while reviewing the imported context. Workspaces
 * reviewed before the accepted list was recorded fall back to the fields whose
 * brand value still equals the reviewed draft's proposal.
 */
export function reviewedContextFields(
  preparation: IWarmupPreparation | undefined,
  brandValues: Partial<Record<BrandKitFieldKey, unknown>>,
): Set<BrandKitFieldKey> {
  if (!preparation?.contextReviewedAt) return new Set();
  if (preparation.appliedContextFields)
    return new Set(preparation.appliedContextFields);
  const draft: IBrandKitDraft | undefined = preparation.context;
  const accepted = new Set<BrandKitFieldKey>();
  for (const key of Object.values(PREVIEW_FIELD_KEYS)) {
    const proposed = draft?.fields[key]?.proposedValue;
    if (proposed !== undefined && sameValue(proposed, brandValues[key]))
      accepted.add(key);
  }
  return accepted;
}

/**
 * The reviewed brand context a logged-out visitor may read. The brand name is
 * the recipient's own identity and always shows; every other field shows only
 * when it was reviewed and has a value, and is omitted otherwise.
 */
export function buildPublicPreviewBrand(
  brand: ContentPreviewBrandSource,
  preparation: IWarmupPreparation | undefined,
  logoUrl?: string,
): IPublicContentPreviewBrand {
  const voice = readRecord(readRecord(brand.agentConfig).voice);
  const values: Partial<Record<BrandKitFieldKey, unknown>> = {
    description: readString(brand.description),
    primaryColor: readString(brand.primaryColor),
    secondaryColor: readString(brand.secondaryColor),
    voiceAudience: readList(voice.audience),
    voiceMessagingPillars: readList(voice.messagingPillars),
    voiceStyle: readString(voice.style),
    voiceTone: readString(voice.tone),
    voiceValues: readList(voice.values),
  };
  const reviewed = reviewedContextFields(preparation, values);
  const result: IPublicContentPreviewBrand = { name: brand.label };
  for (const [field, key] of Object.entries(PREVIEW_FIELD_KEYS) as [
    PreviewBrandField,
    BrandKitFieldKey,
  ][]) {
    const value = values[key];
    if (value !== undefined && reviewed.has(key))
      Object.assign(result, { [field]: value });
  }
  if (logoUrl && reviewed.has('logo')) result.logoUrl = logoUrl;
  return result;
}
