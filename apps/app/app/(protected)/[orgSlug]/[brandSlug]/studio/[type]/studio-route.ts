export type StudioRouteType = 'image' | 'video' | 'music' | 'avatar';

export type StudioSearchParams = Record<string, string | string[] | undefined>;

const CANONICAL_STUDIO_TYPES: readonly StudioRouteType[] = [
  'image',
  'video',
  'music',
  'avatar',
];

const STUDIO_TYPE_ALIASES: Record<string, StudioRouteType> = {
  avatars: 'avatar',
  images: 'image',
  videos: 'video',
};

function normalizeStudioSegment(value: string | string[] | undefined | null) {
  const segment = Array.isArray(value) ? value[0] : value;
  return segment?.toLowerCase().trim() ?? null;
}

export function canonicalizeStudioType(
  value: string | string[] | undefined | null,
): StudioRouteType {
  const normalized = normalizeStudioSegment(value);

  if (!normalized) {
    return 'image';
  }

  if (normalized in STUDIO_TYPE_ALIASES) {
    return STUDIO_TYPE_ALIASES[normalized];
  }

  if (CANONICAL_STUDIO_TYPES.includes(normalized as StudioRouteType)) {
    return normalized as StudioRouteType;
  }

  return 'image';
}

export function buildStudioPath(
  type: string | string[] | undefined | null,
  searchParams: StudioSearchParams = {},
): string {
  const canonicalType = canonicalizeStudioType(type);
  const nextSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'type') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        nextSearchParams.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      nextSearchParams.set(key, value);
    }
  }

  const query = nextSearchParams.toString();
  return query
    ? `/studio/${canonicalType}?${query}`
    : `/studio/${canonicalType}`;
}

export function shouldRedirectStudioTypeRoute(
  type: string | string[] | undefined | null,
  searchParams: StudioSearchParams = {},
): boolean {
  const rawSegment = Array.isArray(type) ? type[0] : type;
  const normalized = normalizeStudioSegment(type);
  const canonicalType = canonicalizeStudioType(type);
  const hasLegacyTypeQuery = Object.hasOwn(searchParams, 'type');

  return (
    rawSegment?.trim() !== canonicalType ||
    normalized !== canonicalType ||
    hasLegacyTypeQuery
  );
}
