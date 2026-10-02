import { AnalyticsMetricAvailability } from '@genfeedai/contracts/enums/analytics-metric-availability.enum';
import { TargetAnalyticsCollectionState } from '@genfeedai/contracts/enums/scheduler.enum';
import type { ExtensionPublicationPlatform } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import type { PublicationInsight } from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import type { ExtensionPublicationPageLookup } from '@genfeedai/contracts/interfaces/extension/extension-publication-insights.interface';
import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces/extension/extension-workspace.interface';
import { z } from 'zod';

const hosts: Record<ExtensionPublicationPlatform, readonly string[]> = {
  twitter: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
  reddit: ['reddit.com', 'old.reddit.com'],
  youtube: ['youtube.com', 'youtu.be'],
  instagram: ['instagram.com'],
  facebook: ['facebook.com'],
  tiktok: ['tiktok.com'],
};
const platforms = [
  'twitter',
  'linkedin',
  'reddit',
  'youtube',
  'instagram',
  'facebook',
  'tiktok',
] as const;
function platformUrl(raw: string): ExtensionPublicationPageLookup | null {
  if (!raw || raw.length > 2048 || /%(?![0-9a-f]{2})/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    const host = url.hostname.replace(/^www\./, '');
    const platform = platforms.find((item) => hosts[item].includes(host));
    return platform ? { platform, pageUrl: url.href } : null;
  } catch {
    return null;
  }
}
export function resolvePublicationInsightPage(
  rawUrl: string | undefined,
): ExtensionPublicationPageLookup | null {
  const lookup = rawUrl ? platformUrl(rawUrl) : null;
  if (!lookup) return null;
  const url = new URL(lookup.pageUrl);
  let parts: string[];
  try {
    const path = url.pathname.endsWith('/')
      ? url.pathname.slice(0, -1)
      : url.pathname;
    parts = path.split('/').slice(1).map(decodeURIComponent);
    if (parts.some((part) => !part.trim() || part.includes('/'))) return null;
  } catch {
    return null;
  }
  const kept =
    lookup.platform === 'linkedin'
      ? ['commentUrn']
      : lookup.platform === 'youtube'
        ? ['v', 'lc']
        : lookup.platform === 'facebook'
          ? ['story_fbid', 'id', 'comment_id', 'reply_comment_id']
          : [];
  for (const key of kept) {
    const values = url.searchParams.getAll(key);
    if (values.length > 1 || values.some((value) => !value.trim())) return null;
    if (
      key === 'commentUrn' &&
      values.length &&
      !/^urn:[^\s]+$/.test(values[0])
    )
      return null;
  }
  const numeric = /^\d+$/;
  const token = /^[a-z0-9_-]+$/i;
  let supported = false;
  switch (lookup.platform) {
    case 'twitter':
      supported =
        parts.length === 3 && parts[1] === 'status' && numeric.test(parts[2]);
      break;
    case 'linkedin':
      supported =
        (parts.length === 3 &&
          parts[0] === 'feed' &&
          parts[1] === 'update' &&
          /^urn:li:activity:\d+$/.test(parts[2])) ||
        (parts.length === 2 &&
          parts[0] === 'posts' &&
          /activity-\d+-/.test(parts[1]));
      break;
    case 'reddit': {
      const base =
        parts[0] === 'r' && parts[2] === 'comments'
          ? parts.slice(3)
          : parts[0] === 'comments'
            ? parts.slice(1)
            : [];
      supported =
        (base.length === 2 || base.length === 3) &&
        /^[a-z0-9]+$/i.test(base[0]) &&
        (base.length !== 3 || /^[a-z0-9]+$/i.test(base[2]));
      break;
    }
    case 'youtube':
      supported =
        (url.hostname.replace(/^www\./, '') === 'youtu.be' &&
          parts.length === 1) ||
        (parts.length === 1 &&
          parts[0] === 'watch' &&
          !!url.searchParams.get('v')) ||
        (parts.length === 2 && parts[0] === 'shorts');
      break;
    case 'instagram':
      supported =
        parts.length === 2 &&
        ['p', 'reel'].includes(parts[0]) &&
        token.test(parts[1]);
      break;
    case 'facebook':
      supported =
        (parts.length === 3 && parts[1] === 'posts') ||
        (parts.length === 2 && parts[0] === 'posts') ||
        (parts.length === 1 &&
          ['story.php', 'permalink.php'].includes(parts[0]) &&
          !!url.searchParams.get('story_fbid'));
      break;
    case 'tiktok':
      supported =
        parts.length === 3 &&
        /^@.+/.test(parts[0]) &&
        parts[1] === 'video' &&
        numeric.test(parts[2]);
      break;
  }
  if (!supported) return null;
  for (const key of [...url.searchParams.keys()])
    if (!kept.includes(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.hash = '';
  return { platform: lookup.platform, pageUrl: url.href };
}
const nonempty = z.string().refine((value) => value.trim().length > 0);
const date = nonempty.refine((value) => Number.isFinite(Date.parse(value)));
const metric = z
  .object({
    value: z.number().finite().nonnegative().nullable(),
    availability: z.enum(AnalyticsMetricAvailability),
  })
  .refine((item) =>
    item.availability === 'observed'
      ? item.value !== null
      : item.value === null,
  );
const insightSchema = z.object({
  id: nonempty,
  organizationId: nonempty,
  brandId: nonempty,
  platform: z.enum(platforms),
  description: z.string(),
  source: z.string().nullable(),
  externalId: z.string().nullable(),
  credentialId: z.string().nullable(),
  publicationDate: date.nullable(),
  isCapturedObservation: z.boolean(),
  publicationKind: z.enum(['post', 'reply', 'unknown']),
  urlKind: z.enum(['permalink', 'context-only', 'unavailable']),
  url: z.string().nullable(),
  contextUrl: z.string().nullable(),
  urlIdentity: z
    .object({
      kind: z.enum([
        'instagram-shortcode',
        'linkedin-activity',
        'facebook-post-token',
        'platform-publication-id',
      ]),
      value: nonempty,
    })
    .nullable(),
  observedVisibility: z.enum(['public', 'private', 'unlisted', 'unknown']),
  analyticsAvailability: z.enum([
    'eligible',
    'missing-external-id',
    'missing-credential',
    'unsupported-platform',
    'unsupported-publication-kind',
    'provider-id-unresolved',
  ]),
  collectionState: z.enum(TargetAnalyticsCollectionState),
  collectionMessage: z.string().nullable(),
  latestSample: z
    .object({
      date,
      updatedAt: date,
      metrics: z
        .object({
          views: metric,
          likes: metric,
          comments: metric,
          shares: metric,
          saves: metric,
        })
        .strict(),
    })
    .nullable(),
  linkCandidates: z.array(z.object({ id: nonempty, label: nonempty })),
});
export function parsePublicationInsight(
  value: unknown,
  snapshot: ExtensionWorkspaceSnapshot,
  platform?: ExtensionPublicationPlatform,
): PublicationInsight {
  const parsed = insightSchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid publication response.');
  const item = parsed.data;
  if (
    item.organizationId !== snapshot.organizationId ||
    item.brandId !== snapshot.brandId ||
    (platform && item.platform !== platform) ||
    new Set(item.linkCandidates.map((candidate) => candidate.id)).size !==
      item.linkCandidates.length
  )
    throw new Error('Invalid publication response.');
  for (const link of [item.url, item.contextUrl])
    if (link !== null && platformUrl(link)?.platform !== item.platform)
      throw new Error('Invalid publication response.');
  if (
    (item.urlKind === 'permalink' && !item.url) ||
    (item.urlKind === 'context-only' &&
      (!item.contextUrl || item.url !== null)) ||
    (item.urlKind === 'unavailable' &&
      (item.url !== null || item.contextUrl !== null))
  )
    throw new Error('Invalid publication response.');
  return item as PublicationInsight;
}
