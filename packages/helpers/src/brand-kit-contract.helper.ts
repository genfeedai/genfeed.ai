import {
  BRAND_KIT_FIELD_OWNERSHIP,
  type BrandKitAssetRole,
  type BrandKitFieldKey,
  type BrandKitSourceType,
  type IBrandKitAssetValue,
  type IBrandKitDiagnostic,
  type IBrandKitDraft,
  type IBrandKitDraftField,
  type IBrandKitFieldOwner,
  type IBrandKitReadiness,
  type IBrandKitSocialLink,
  type IBrandKitSourceEvidence,
} from '@genfeedai/interfaces';

interface BrandKitAssetSource {
  id?: string;
  url?: string;
  label?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

interface BrandKitLinkSource {
  label?: string;
  category?: string;
  url?: string;
}

export interface BrandKitSourceBrand {
  id: string;
  organization?: string | { id?: string | null } | null;
  label?: string | null;
  description?: string | null;
  text?: string | null;
  fontFamily?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  logo?: BrandKitAssetSource | null;
  banner?: BrandKitAssetSource | null;
  references?: BrandKitAssetSource[] | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryReferenceUrl?: string | null;
  referenceImages?: Array<string | BrandKitAssetSource> | null;
  links?: BrandKitLinkSource[] | null;
  youtubeUrl?: string | null;
  tiktokUrl?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  linkedinUrl?: string | null;
  agentConfig?: {
    voice?: {
      tone?: string | null;
      style?: string | null;
      audience?: string[] | null;
      values?: string[] | null;
      messagingPillars?: string[] | null;
      doNotSoundLike?: string[] | null;
      sampleOutput?: string | null;
    } | null;
    strategy?: {
      contentTypes?: string[] | null;
      platforms?: string[] | null;
      goals?: string[] | null;
      frequency?: string | null;
    } | null;
  } | null;
}

export interface BuildBrandKitDraftOptions {
  draftId?: string;
  sourceType?: BrandKitSourceType;
  evidence?: IBrandKitSourceEvidence[];
  diagnostics?: IBrandKitDiagnostic[];
  createdAt?: string;
  updatedAt?: string;
}

const REQUIRED_BRAND_KIT_FIELDS: readonly BrandKitFieldKey[] = [
  'label',
  'description',
  'primaryColor',
  'fontFamily',
  'promptGuidelines',
  'voiceTone',
  'voiceStyle',
  'logo',
  'references',
];

const DEFAULT_PRIMARY_COLORS = new Set(['#000', '#000000']);

const SOCIAL_URL_FIELDS: ReadonlyArray<{
  platform: string;
  key:
    | 'youtubeUrl'
    | 'tiktokUrl'
    | 'instagramUrl'
    | 'twitterUrl'
    | 'linkedinUrl';
}> = [
  { key: 'youtubeUrl', platform: 'youtube' },
  { key: 'tiktokUrl', platform: 'tiktok' },
  { key: 'instagramUrl', platform: 'instagram' },
  { key: 'twitterUrl', platform: 'twitter' },
  { key: 'linkedinUrl', platform: 'linkedin' },
];

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getOrganizationId(
  organization: BrandKitSourceBrand['organization'],
): string | undefined {
  if (typeof organization === 'string') {
    return organization;
  }
  if (organization && hasText(organization.id)) {
    return organization.id;
  }
  return undefined;
}

function findOwner(key: BrandKitFieldKey): IBrandKitFieldOwner {
  const owner = BRAND_KIT_FIELD_OWNERSHIP.find((entry) => entry.key === key);
  if (!owner) {
    throw new Error(`Missing brand kit owner mapping for ${key}`);
  }
  return owner;
}

function toAssetValue(
  role: BrandKitAssetRole,
  asset: BrandKitAssetSource | string | null | undefined,
): IBrandKitAssetValue | undefined {
  if (!asset) {
    return undefined;
  }

  if (typeof asset === 'string') {
    return hasText(asset)
      ? {
          role,
          sourceType: 'current_brand',
          url: asset,
        }
      : undefined;
  }

  if (!hasText(asset.id) && !hasText(asset.url)) {
    return undefined;
  }

  return {
    height: asset.height,
    id: asset.id,
    label: asset.label,
    mimeType: asset.mimeType,
    role,
    sourceType: 'current_brand',
    url: asset.url,
    width: asset.width,
  };
}

function readReferenceAssets(
  brand: BrandKitSourceBrand,
): IBrandKitAssetValue[] {
  const references = brand.references ?? [];
  const referenceImages = brand.referenceImages ?? [];
  const values: IBrandKitAssetValue[] = [];
  const seenUrls = new Set<string>();

  for (const reference of references) {
    const value = toAssetValue('reference', reference);
    if (value) {
      if (value.url) {
        if (seenUrls.has(value.url)) {
          continue;
        }
        seenUrls.add(value.url);
      }
      values.push(value);
    }
  }

  const primaryReference = toAssetValue('reference', brand.primaryReferenceUrl);
  if (primaryReference) {
    if (!primaryReference.url || !seenUrls.has(primaryReference.url)) {
      if (primaryReference.url) {
        seenUrls.add(primaryReference.url);
      }
      values.push(primaryReference);
    }
  }

  for (const referenceImage of referenceImages) {
    const value = toAssetValue('reference', referenceImage);
    if (value) {
      if (value.url) {
        if (seenUrls.has(value.url)) {
          continue;
        }
        seenUrls.add(value.url);
      }
      values.push(value);
    }
  }

  return values;
}

function readSocialLinks(brand: BrandKitSourceBrand): IBrandKitSocialLink[] {
  const links: IBrandKitSocialLink[] = [];
  const seenUrls = new Set<string>();

  for (const field of SOCIAL_URL_FIELDS) {
    const url = brand[field.key];
    if (!hasText(url) || seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);
    links.push({
      platform: field.platform,
      sourceType: 'current_brand',
      url,
    });
  }

  for (const link of brand.links ?? []) {
    if (!hasText(link.url) || seenUrls.has(link.url)) {
      continue;
    }
    seenUrls.add(link.url);
    links.push({
      label: link.label,
      platform: link.category ?? 'link',
      sourceType: 'current_brand',
      url: link.url,
    });
  }

  return links;
}

function readCurrentValue(
  brand: BrandKitSourceBrand,
  key: BrandKitFieldKey,
): unknown {
  switch (key) {
    case 'label':
      return brand.label ?? undefined;
    case 'description':
      return brand.description ?? undefined;
    case 'primaryColor':
      return brand.primaryColor ?? undefined;
    case 'secondaryColor':
      return brand.secondaryColor ?? undefined;
    case 'backgroundColor':
      return brand.backgroundColor ?? undefined;
    case 'fontFamily':
      return brand.fontFamily ?? undefined;
    case 'promptGuidelines':
      return brand.text ?? undefined;
    case 'voiceTone':
      return brand.agentConfig?.voice?.tone ?? undefined;
    case 'voiceStyle':
      return brand.agentConfig?.voice?.style ?? undefined;
    case 'voiceAudience':
      return brand.agentConfig?.voice?.audience ?? undefined;
    case 'voiceValues':
      return brand.agentConfig?.voice?.values ?? undefined;
    case 'voiceMessagingPillars':
      return brand.agentConfig?.voice?.messagingPillars ?? undefined;
    case 'voiceDoNotSoundLike':
      return brand.agentConfig?.voice?.doNotSoundLike ?? undefined;
    case 'voiceSampleOutput':
      return brand.agentConfig?.voice?.sampleOutput ?? undefined;
    case 'strategyContentTypes':
      return brand.agentConfig?.strategy?.contentTypes ?? undefined;
    case 'strategyPlatforms':
      return brand.agentConfig?.strategy?.platforms ?? undefined;
    case 'strategyGoals':
      return brand.agentConfig?.strategy?.goals ?? undefined;
    case 'strategyFrequency':
      return brand.agentConfig?.strategy?.frequency ?? undefined;
    case 'socialLinks':
      return readSocialLinks(brand);
    case 'logo':
      return (
        toAssetValue('logo', brand.logo) ?? toAssetValue('logo', brand.logoUrl)
      );
    case 'banner':
      return (
        toAssetValue('banner', brand.banner) ??
        toAssetValue('banner', brand.bannerUrl)
      );
    case 'references':
      return readReferenceAssets(brand);
  }
}

function hasMeaningfulFieldValue(
  key: BrandKitFieldKey,
  value: unknown,
): boolean {
  if (key === 'primaryColor' && hasText(value)) {
    return !DEFAULT_PRIMARY_COLORS.has(value.trim().toLowerCase());
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length > 0;
  }
  return hasText(value);
}

function createMissingFieldDiagnostic(
  key: BrandKitFieldKey,
): IBrandKitDiagnostic {
  const owner = findOwner(key);
  return {
    code: `brand_kit_missing_${key}`,
    fieldKey: key,
    message: `${owner.label} is missing from the current brand kit.`,
    severity: 'warning',
  };
}

function buildReadiness(
  fields: Partial<Record<BrandKitFieldKey, IBrandKitDraftField>>,
  diagnostics: IBrandKitDiagnostic[],
): IBrandKitReadiness {
  const missingFields = REQUIRED_BRAND_KIT_FIELDS.filter((key) => {
    const field = fields[key];
    const value = field?.proposedValue ?? field?.currentValue;
    return !hasMeaningfulFieldValue(key, value);
  });

  const missingDiagnostics = missingFields.map(createMissingFieldDiagnostic);
  const blockingDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  const readinessDiagnostics = [...diagnostics, ...missingDiagnostics];
  const completedFields =
    REQUIRED_BRAND_KIT_FIELDS.length - missingFields.length;
  const score = Math.round(
    (completedFields / REQUIRED_BRAND_KIT_FIELDS.length) * 100,
  );

  if (blockingDiagnostics.length > 0) {
    return {
      diagnostics: readinessDiagnostics,
      missingFields,
      requiredFields: [...REQUIRED_BRAND_KIT_FIELDS],
      score,
      status: 'blocked',
    };
  }

  if (missingFields.length === 0) {
    return {
      diagnostics: readinessDiagnostics,
      missingFields,
      requiredFields: [...REQUIRED_BRAND_KIT_FIELDS],
      score: 100,
      status: 'complete',
    };
  }

  return {
    diagnostics: readinessDiagnostics,
    missingFields,
    requiredFields: [...REQUIRED_BRAND_KIT_FIELDS],
    score,
    status:
      missingFields.length === REQUIRED_BRAND_KIT_FIELDS.length
        ? 'missing'
        : 'partial',
  };
}

function buildDraftField(
  brand: BrandKitSourceBrand,
  owner: IBrandKitFieldOwner,
  evidence: IBrandKitSourceEvidence[],
): IBrandKitDraftField {
  return {
    applyActionDefault: owner.applyActionDefault,
    currentValue: readCurrentValue(brand, owner.key),
    diagnostics: [],
    evidence,
    group: owner.group,
    key: owner.key,
    label: owner.label,
    ownerPath: owner.ownerPath,
  };
}

export function buildBrandKitDraftFromBrand(
  brand: BrandKitSourceBrand,
  options: BuildBrandKitDraftOptions = {},
): IBrandKitDraft {
  const sourceType = options.sourceType ?? 'current_brand';
  const evidence: IBrandKitSourceEvidence[] =
    options.evidence && options.evidence.length > 0
      ? options.evidence
      : [
          {
            label: 'Current brand record',
            sourceId: brand.id,
            sourceType,
          },
        ];
  const fields: Partial<Record<BrandKitFieldKey, IBrandKitDraftField>> = {};

  for (const owner of BRAND_KIT_FIELD_OWNERSHIP) {
    fields[owner.key] = buildDraftField(brand, owner, evidence);
  }

  const diagnostics = options.diagnostics ?? [];
  const readiness = buildReadiness(fields, diagnostics);

  return {
    assetCandidates: [],
    brandId: brand.id,
    createdAt: options.createdAt,
    diagnostics,
    evidence,
    fields,
    id: options.draftId,
    organizationId: getOrganizationId(brand.organization),
    readiness,
    sourceType,
    status: readiness.status === 'complete' ? 'ready' : readiness.status,
    updatedAt: options.updatedAt,
  };
}

export function computeBrandKitReadiness(
  brand: BrandKitSourceBrand,
): IBrandKitReadiness {
  return buildBrandKitDraftFromBrand(brand).readiness;
}

export function getBrandKitFieldOwner(
  key: BrandKitFieldKey,
): IBrandKitFieldOwner {
  return findOwner(key);
}
