import type {
  ExtensionPublicationAnalyticsAvailability,
  ExtensionPublicationAuthor,
  ExtensionPublicationCaptureInput,
  ExtensionPublicationCaptureResult,
  ExtensionPublicationObservedVisibility,
  ExtensionPublicationPlatform,
  ExtensionPublicationUrlIdentity,
} from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import type { Credential, Post, Prisma } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const MAX_PUBLICATION_BYTES = 1048576;
const PUBLICATION_TOO_LARGE_MESSAGE =
  'This publication is too large to record automatically. Its full text was not saved.';

const nonempty = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);
const publicationCaptureSchema = z
  .object({
    brandId: nonempty,
    platform: z.enum([
      'twitter',
      'linkedin',
      'reddit',
      'youtube',
      'instagram',
      'facebook',
      'tiktok',
    ]),
    publicationKind: z.enum(['post', 'reply']),
    observedVisibility: z
      .enum(['public', 'private', 'unlisted', 'unknown'])
      .optional(),
    url: nonempty.max(2048).optional(),
    contextUrl: nonempty.max(2048).optional(),
    externalId: nonempty.max(256).optional(),
    description: z
      .string()
      .max(MAX_PUBLICATION_BYTES, PUBLICATION_TOO_LARGE_MESSAGE)
      .refine(
        (value) =>
          value.length <= MAX_PUBLICATION_BYTES &&
          new TextEncoder().encode(value).byteLength <= MAX_PUBLICATION_BYTES,
        PUBLICATION_TOO_LARGE_MESSAGE,
      ),
    publicationDate: z.iso.datetime({ offset: true }).refine((value) => {
      const date = Date.parse(value);
      return Number.isFinite(date) && date <= Date.now() + 5 * 60 * 1000;
    }, 'Publication date must be finite and no more than five minutes in the future'),
    author: z
      .object({
        externalId: nonempty.max(256).optional(),
        handle: nonempty.max(256).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.url
        ? input.contextUrl !== undefined
        : input.publicationKind !== 'reply' ||
          !input.contextUrl ||
          !input.externalId
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Supply a publication permalink, or for a reply only an observed externalId and parent contextUrl',
      });
    }
  });

export function parseExtensionPublicationCaptureInput(
  input: unknown,
): ExtensionPublicationCaptureInput {
  const parsed = publicationCaptureSchema.safeParse(input);
  if (!parsed.success) {
    const oversized = parsed.error.issues.some(
      (issue) =>
        issue.path[0] === 'description' &&
        issue.message === PUBLICATION_TOO_LARGE_MESSAGE,
    );
    throw new BadRequestException(
      oversized
        ? PUBLICATION_TOO_LARGE_MESSAGE
        : 'Invalid reported publication capture input',
    );
  }
  return parsed.data;
}

export type NormalizedExtensionPublication = {
  contextUrl: string | null;
  externalId: string | null;
  url: string | null;
  urlKind: 'permalink' | 'context-only';
  urlIdentity: ExtensionPublicationUrlIdentity | null;
};

type ParsedPublicationUrl = {
  url: string;
  id: string | null;
  urlToken: string | null;
  segments: string[];
  identityValues: string[];
};

const PLATFORM_HOSTS: Record<ExtensionPublicationPlatform, readonly string[]> =
  {
    twitter: ['twitter.com'],
    linkedin: ['linkedin.com'],
    reddit: ['reddit.com', 'old.reddit.com'],
    youtube: ['youtube.com', 'youtu.be'],
    instagram: ['instagram.com'],
    facebook: ['facebook.com'],
    tiktok: ['tiktok.com'],
  };
const PLATFORM_IDENTITY_KEYS: Record<
  ExtensionPublicationPlatform,
  readonly string[]
> = {
  twitter: [],
  linkedin: ['commentUrn'],
  reddit: [],
  youtube: ['v', 'lc'],
  instagram: [],
  facebook: ['story_fbid', 'id', 'comment_id', 'reply_comment_id'],
  tiktok: [],
};

function invalidUrl(): never {
  throw new BadRequestException(
    'Invalid publication URL or publication identity',
  );
}

function parsePublicationUrl(
  raw: string,
  platform: ExtensionPublicationPlatform,
  kind: 'post' | 'reply',
): ParsedPublicationUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalidUrl();
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    return invalidUrl();
  let hostname = url.hostname.replace(/^www\./, '');
  if (platform === 'twitter' && hostname === 'x.com') hostname = 'twitter.com';
  if (!PLATFORM_HOSTS[platform].includes(hostname)) return invalidUrl();
  url.hostname = hostname;
  url.hash = '';
  const retained = new URLSearchParams();
  for (const key of PLATFORM_IDENTITY_KEYS[platform]) {
    const values = url.searchParams.getAll(key);
    if (values.length > 1) return invalidUrl();
    if (values.length) retained.set(key, values[0]);
  }
  retained.sort();
  url.search = retained.toString();
  // A single trailing slash has no publication identity significance.
  url.pathname = url.pathname.replace(/\/$/, '');
  let segments: string[];
  try {
    segments = url.pathname
      .slice(1)
      .split('/')
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return invalidUrl();
  }
  if (segments.some((segment) => !segment || segment.includes('/')))
    return invalidUrl();
  const numeric = (value: string | undefined) =>
    value && /^\d+$/.test(value) ? value : null;
  const alpha = (value: string | undefined) =>
    value && /^[a-zA-Z0-9]+$/.test(value) ? value : null;
  let postId: string | null = null;
  let replyId: string | null = null;
  let valid = false;
  let urlToken: string | null = null;
  switch (platform) {
    case 'twitter':
      valid = segments.length === 3 && segments[1] === 'status';
      postId = numeric(segments[2]);
      valid = valid && postId !== null;
      replyId = postId;
      break;
    case 'linkedin':
      valid =
        (segments.length === 3 &&
          segments[0] === 'feed' &&
          segments[1] === 'update') ||
        (segments.length === 2 &&
          segments[0] === 'posts' &&
          /activity-/.test(segments[1]));
      postId =
        segments[0] === 'feed'
          ? (/^urn:li:activity:(\d+)$/.exec(segments[2] ?? '')?.[1] ?? null)
          : (/activity-(\d+)-/.exec(segments[1] ?? '')?.[1] ?? null);
      urlToken = segments[0] === 'feed' ? segments[2] : segments[1];
      replyId = retained.get('commentUrn') || null;
      break;
    case 'reddit': {
      const offset = segments[0] === 'r' ? 2 : 0;
      valid =
        segments[offset] === 'comments' &&
        (segments.length === offset + 3 || segments.length === offset + 4);
      postId = alpha(segments[offset + 1]);
      replyId =
        segments.length === offset + 4 ? alpha(segments[offset + 3]) : null;
      break;
    }
    case 'youtube':
      valid =
        hostname === 'youtu.be'
          ? segments.length === 1
          : (segments.length === 1 &&
              segments[0] === 'watch' &&
              Boolean(retained.get('v'))) ||
            (segments.length === 2 && segments[0] === 'shorts');
      postId =
        hostname === 'youtu.be'
          ? segments[0]
          : segments[0] === 'watch'
            ? retained.get('v')
            : segments[1];
      replyId = retained.get('lc') || null;
      break;
    case 'instagram':
      valid = segments.length === 2 && ['p', 'reel'].includes(segments[0]);
      postId = /^[a-zA-Z0-9_-]+$/.test(segments[1] ?? '') ? segments[1] : null;
      break;
    case 'facebook':
      valid =
        (segments.length === 3 && segments[1] === 'posts') ||
        (segments.length === 2 && segments[0] === 'posts') ||
        (segments.length === 1 &&
          ['story.php', 'permalink.php'].includes(segments[0]) &&
          Boolean(retained.get('story_fbid')));
      postId = numeric(
        segments.at(-2) === 'posts'
          ? segments.at(-1)
          : (retained.get('story_fbid') ?? undefined),
      );
      urlToken =
        segments.at(-2) === 'posts'
          ? (segments.at(-1) ?? null)
          : retained.get('story_fbid');
      replyId =
        retained.get('reply_comment_id') || retained.get('comment_id') || null;
      break;
    case 'tiktok':
      valid =
        segments.length === 3 &&
        segments[0].startsWith('@') &&
        segments[0].length > 1 &&
        segments[1] === 'video';
      postId = numeric(segments[2]);
      break;
  }
  if (!valid) return invalidUrl();
  if (
    kind === 'reply' &&
    (platform === 'instagram' ||
      platform === 'tiktok' ||
      (platform !== 'twitter' && !replyId))
  )
    return invalidUrl();
  return {
    url: url.toString(),
    urlToken: kind === 'reply' ? replyId : (urlToken ?? postId),
    id: kind === 'reply' ? replyId : postId,
    segments,
    identityValues: [...retained.values()],
  };
}

export function normalizeExtensionPublication(
  input: Pick<
    ExtensionPublicationCaptureInput,
    'platform' | 'publicationKind' | 'url' | 'contextUrl' | 'externalId'
  >,
): NormalizedExtensionPublication {
  if (!input.url) {
    if (
      input.publicationKind !== 'reply' ||
      !input.contextUrl ||
      !input.externalId
    )
      return invalidUrl();
    const parent = parsePublicationUrl(
      input.contextUrl,
      input.platform,
      'post',
    );
    if (parent.id === input.externalId || parent.urlToken === input.externalId)
      return invalidUrl();
    return {
      contextUrl: parent.url,
      externalId: input.externalId,
      url: null,
      urlKind: 'context-only',
      urlIdentity: null,
    };
  }
  if (input.contextUrl) return invalidUrl();
  const parsed = parsePublicationUrl(
    input.url,
    input.platform,
    input.publicationKind,
  );
  let externalId: string | null = input.externalId ?? parsed.id;
  let identityKind: ExtensionPublicationUrlIdentity['kind'] =
    'platform-publication-id';
  if (
    input.publicationKind === 'post' &&
    ['instagram', 'linkedin', 'facebook'].includes(input.platform)
  ) {
    identityKind =
      input.platform === 'instagram'
        ? 'instagram-shortcode'
        : input.platform === 'linkedin'
          ? 'linkedin-activity'
          : 'facebook-post-token';
    externalId = null;
    if (input.externalId) {
      const compatible =
        input.platform === 'instagram'
          ? /^[0-9]+$/.test(input.externalId)
          : input.platform === 'linkedin'
            ? /^urn:li:(share|ugcPost):[0-9]+$/.test(input.externalId)
            : /^[0-9]+_[0-9]+$/.test(input.externalId);
      if (compatible) externalId = input.externalId;
      else if (
        input.externalId !== parsed.urlToken &&
        input.externalId !== parsed.id
      )
        return invalidUrl();
    }
  } else if (
    input.externalId &&
    (parsed.id
      ? parsed.id !== input.externalId
      : ![...parsed.segments, ...parsed.identityValues].includes(
          input.externalId,
        ))
  )
    return invalidUrl();
  const urlIdentity: ExtensionPublicationUrlIdentity | null = parsed.urlToken
    ? { kind: identityKind, value: parsed.urlToken }
    : null;
  return {
    contextUrl: null,
    externalId,
    url: parsed.url,
    urlKind: 'permalink',
    urlIdentity,
  };
}

export function extensionPublicationAnalyticsAvailability(
  externalId: string | null,
  credentialId: string | null,
  platform: string | null,
  kind: 'post' | 'reply',
  urlIdentity?: ExtensionPublicationUrlIdentity | null,
): ExtensionPublicationAnalyticsAvailability {
  if (kind === 'reply' && platform !== 'twitter')
    return 'unsupported-publication-kind';
  if (
    ![
      'twitter',
      'linkedin',
      'youtube',
      'instagram',
      'facebook',
      'tiktok',
    ].includes(platform ?? '')
  )
    return 'unsupported-platform';
  if (!externalId)
    return urlIdentity &&
      ['instagram', 'linkedin', 'facebook'].includes(platform ?? '')
      ? 'provider-id-unresolved'
      : 'missing-external-id';
  const compatible =
    platform === 'linkedin'
      ? /^urn:li:(share|ugcPost):[0-9]+$/.test(externalId)
      : platform === 'facebook'
        ? /^[0-9]+_[0-9]+$/.test(externalId)
        : platform === 'youtube'
          ? externalId.trim().length > 0
          : /^[0-9]+$/.test(externalId);
  if (!compatible) return 'provider-id-unresolved';
  if (!credentialId) return 'missing-credential';
  return 'eligible';
}

export function extensionPublicationAnalyticsError(
  reason: ExtensionPublicationAnalyticsAvailability,
): Prisma.InputJsonObject | undefined {
  if (reason === 'eligible') return undefined;
  const messages = {
    'missing-external-id':
      'The reported publication has no external identity for analytics.',
    'missing-credential':
      'No unique connected author credential matches the reported publication.',
    'unsupported-platform':
      'Scheduled analytics collection does not support this platform.',
    'provider-id-unresolved':
      'The publication was recorded, but its analytics provider identity is not available.',
    'unsupported-publication-kind':
      'Scheduled analytics collection does not support replies on this platform.',
  };
  return {
    code: `EXTENSION_CAPTURE_${reason.toUpperCase().replaceAll('-', '_')}`,
    message: messages[reason],
  };
}

type CapturedPostRecord = Pick<
  Post,
  | 'id'
  | 'source'
  | 'externalId'
  | 'url'
  | 'credentialId'
  | 'platform'
  | 'targetSettings'
  | 'visibility'
>;

const metadataObjectSchema = z.record(z.string(), z.unknown());
const urlIdentitySchema = z
  .object({
    kind: z.enum([
      'instagram-shortcode',
      'linkedin-activity',
      'facebook-post-token',
      'platform-publication-id',
    ]),
    value: z.string().min(1),
  })
  .strict();

function captureMetadata(settings: unknown): Record<string, unknown> | null {
  const parsed = metadataObjectSchema.safeParse(settings);
  if (!parsed.success) return null;
  const capture = metadataObjectSchema.safeParse(parsed.data.extensionCapture);
  return capture.success ? capture.data : null;
}

type ExtensionPublicationMetadataRecord = {
  source?: string | null;
  targetSettings?: unknown;
};
export type ExtensionPublicationAnalyticsRecord =
  ExtensionPublicationMetadataRecord & {
    externalId?: string | null;
    credentialId?: string | null;
    platform?: string | null;
  };

export function isExtensionPublicationCapture(
  post: ExtensionPublicationMetadataRecord,
): boolean {
  return (
    post.source === 'extension' &&
    captureMetadata(post.targetSettings)?.version === 1
  );
}

export function extensionPublicationCaptureAnalyticsAvailability(
  post: ExtensionPublicationAnalyticsRecord,
): ExtensionPublicationAnalyticsAvailability {
  const metadata = captureMetadata(post.targetSettings);
  const urlIdentity = urlIdentitySchema.safeParse(metadata?.urlIdentity);
  return extensionPublicationAnalyticsAvailability(
    post.externalId ?? null,
    post.credentialId ?? null,
    post.platform ?? null,
    metadata?.publicationKind === 'reply' ? 'reply' : 'post',
    urlIdentity.success ? urlIdentity.data : null,
  );
}

export function resolveExtensionPublicationObservedVisibility(
  visibility: unknown,
): ExtensionPublicationObservedVisibility {
  return visibility === 'public' ||
    visibility === 'private' ||
    visibility === 'unlisted'
    ? visibility
    : 'unknown';
}

export function extensionPublicationCaptureResult(
  post: CapturedPostRecord,
  created: boolean,
): ExtensionPublicationCaptureResult {
  const metadata = captureMetadata(post.targetSettings);
  const urlIdentity = urlIdentitySchema.safeParse(metadata?.urlIdentity);
  const url = post.url?.trim() ? post.url : null;
  let contextUrl: string | null = null;
  if (!url && typeof metadata?.contextUrl === 'string') {
    const platform = z
      .enum([
        'twitter',
        'linkedin',
        'reddit',
        'youtube',
        'instagram',
        'facebook',
        'tiktok',
      ])
      .safeParse(post.platform);
    if (platform.success) {
      try {
        contextUrl = parsePublicationUrl(
          metadata.contextUrl,
          platform.data,
          'post',
        ).url;
      } catch {
        /* Invalid historical metadata is unavailable. */
      }
    }
  }
  return {
    observedVisibility: resolveExtensionPublicationObservedVisibility(
      post.visibility,
    ),
    postId: post.id,
    created,
    source: post.source,
    externalId: post.externalId,
    credentialId: post.credentialId,
    url,
    contextUrl,
    urlKind: url ? 'permalink' : contextUrl ? 'context-only' : 'unavailable',
    urlIdentity: urlIdentity.success ? urlIdentity.data : null,
    analyticsAvailability:
      extensionPublicationCaptureAnalyticsAvailability(post),
  };
}

export function extensionPublicationAuthorMatchesCredential(
  author: ExtensionPublicationAuthor | null | undefined,
  credential: Pick<Credential, 'externalId' | 'externalHandle' | 'username'>,
): boolean {
  if (author?.externalId) return credential.externalId === author.externalId;
  const normalizeHandle = (handle: string | null | undefined) =>
    handle?.trim().replace(/^@/, '').toLowerCase() ?? '';
  const handle = normalizeHandle(author?.handle);
  return (
    !!handle &&
    (normalizeHandle(credential.externalHandle) === handle ||
      normalizeHandle(credential.username) === handle)
  );
}

export function extensionPublicationObservedAuthor(
  targetSettings: unknown,
): ExtensionPublicationAuthor | null {
  const metadata = captureMetadata(targetSettings);
  if (metadata?.version !== 1) return null;
  const author = publicationCaptureSchema.shape.author.safeParse(
    metadata.author,
  );
  return author.success && (author.data?.externalId || author.data?.handle)
    ? author.data
    : null;
}
