import {
  type ImportedSourceSnapshotInput,
  importedSourceSnapshotInputSchema,
} from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import type {
  ImportedSourceKind,
  ImportedSourceMediaAvailability,
  ImportedSourceMediaKind,
  RawMediaCandidate,
  RawSourceCapture,
  SourceCapturePreview,
  SourceMediaChoice,
  SourceSaveRequest,
} from '~models/imported-source.model';
import {
  sanitizeCaptureText,
  sanitizeCaptureUrl,
} from '~utils/knowledge-snapshot.util';

export class SourceCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceCaptureError';
  }
}

const EXCERPT_LENGTH = 400;
const MAX_MEDIA_CANDIDATES = 40;
const CAPTURE_SCOPES = ['page', 'selection', 'link', 'media'];
const CAPTURE_HOSTS = ['x', 'reddit', 'youtube', 'social'];
const MEDIA_KINDS = ['image', 'video', 'audio'];
const MEDIA_ORIGINS = [
  'element',
  'player',
  'meta',
  'structured-data',
  'link',
  'selected',
];
const MEDIA_EXTENSIONS: Record<ImportedSourceMediaKind, RegExp> = {
  audio: /\.(?:mp3|m4a|aac|ogg|oga|wav)(?:$|[?#])/i,
  image: /\.(?:jpe?g|png|gif|webp|avif)(?:$|[?#])/i,
  video: /\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i,
};
const STREAM_MANIFEST = /\.(?:m3u8|mpd)(?:$|[?#])/i;
const PLAYER_HOSTS =
  /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|spotify\.com|soundcloud\.com|twitch\.tv|tiktok\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|reddit\.com|redd\.it|podcasts\.apple\.com|embed\.podcasts\.apple\.com)$/i;
const NEWSLETTER_HOSTS =
  /(^|\.)(substack\.com|beehiiv\.com|buttondown\.com|buttondown\.email|kit\.com|convertkit\.com|mailchi\.mp|revue\.co)$/i;
const PODCAST_HOSTS =
  /(^|\.)(podcasts\.apple\.com|overcast\.fm|pocketcasts\.com|castbox\.fm|podbean\.com|buzzsprout\.com|libsyn\.com|transistor\.fm|simplecast\.com|captivate\.fm|megaphone\.fm|podcasts\.google\.com|anchor\.fm|podcasters\.spotify\.com)$/i;

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** The page URL the source is saved under. A declared canonical must stay on the same site. */
function pageUrlOf(raw: RawSourceCapture): string {
  const declared = raw.canonicalUrl;
  if (
    declared &&
    isHttpUrl(declared) &&
    (raw.host !== undefined || hostnameOf(declared) === hostnameOf(raw.url))
  ) {
    return declared;
  }
  return raw.url;
}

function mediaNote(
  kind: ImportedSourceMediaKind,
  availability: ImportedSourceMediaAvailability,
): string {
  switch (availability) {
    case 'accessible':
      return 'Genfeed can copy this file into your Library after you prepare it.';
    case 'embed_only':
      return `This ${kind} plays in the site's own player. Genfeed saves the link and text, not the original ${kind}.`;
    case 'unavailable':
      return `This ${kind} is private or stream-only on the page, so Genfeed cannot copy it. The link and text can still be saved.`;
    default:
      return 'Genfeed will check this file when you prepare it.';
  }
}

/** The honest availability of one candidate; a thumbnail is never a video or audio file. */
function availabilityOf(
  candidate: RawMediaCandidate,
  pageUrl: string,
): { availability: ImportedSourceMediaAvailability; url: string } {
  if (!isHttpUrl(candidate.url)) {
    return { availability: 'unavailable', url: pageUrl };
  }
  const host = hostnameOf(candidate.url);
  if (STREAM_MANIFEST.test(candidate.url)) {
    return { availability: 'unavailable', url: pageUrl };
  }
  if (candidate.kind !== 'image' && candidate.origin === 'player') {
    return { availability: 'embed_only', url: candidate.url };
  }
  if (candidate.kind !== 'image' && PLAYER_HOSTS.test(host)) {
    return { availability: 'embed_only', url: candidate.url };
  }
  if (
    MEDIA_EXTENSIONS[candidate.kind].test(candidate.url) ||
    (candidate.kind === 'image' && candidate.origin !== 'link')
  ) {
    return { availability: 'accessible', url: candidate.url };
  }
  if (candidate.kind !== 'image' && candidate.origin === 'meta') {
    // An og:video URL is normally a player page, not the file.
    return { availability: 'embed_only', url: candidate.url };
  }
  return { availability: 'unknown', url: candidate.url };
}

export function describeMedia(raw: RawSourceCapture): SourceMediaChoice[] {
  const pageUrl = pageUrlOf(raw);
  return raw.media.map((candidate) => {
    const { availability, url } = availabilityOf(candidate, pageUrl);
    const base =
      candidate.label ||
      (candidate.kind === 'image'
        ? 'Image'
        : candidate.kind === 'video'
          ? 'Video'
          : 'Audio');
    const label =
      candidate.kind === 'image' &&
      candidate.origin === 'meta' &&
      raw.media.some((item) => item.kind !== 'image')
        ? 'Preview image (not the video or audio)'
        : base;
    return {
      availability,
      kind: candidate.kind,
      label,
      note: mediaNote(candidate.kind, availability),
      url,
    };
  });
}

export function classifySourceKind(raw: RawSourceCapture): ImportedSourceKind {
  if (raw.host === 'x' || raw.host === 'reddit' || raw.host === 'social') {
    return 'social';
  }
  if (raw.host === 'youtube') return 'video';
  const url = pageUrlOf(raw);
  const host = hostnameOf(url);
  const path = pathnameOf(url);
  if (raw.scope === 'media') return raw.media[0]?.kind ?? 'page';
  const hints = raw.typeHints.join(' ');
  if (
    /podcast/.test(hints) ||
    PODCAST_HOSTS.test(host) ||
    (/(^|\.)spotify\.com$/.test(host) && /^\/(?:episode|show)\//.test(path))
  ) {
    return 'podcast';
  }
  if (
    NEWSLETTER_HOSTS.test(host) ||
    /newsletter/.test(hints) ||
    /^newsletter\./.test(host)
  ) {
    return 'newsletter';
  }
  if (/\b(?:article|blogposting|newsarticle|reportage)\b/.test(hints)) {
    return 'article';
  }
  if (
    raw.text.length < 2_000 &&
    raw.media.some((item) => item.kind === 'audio' && item.origin !== 'meta')
  ) {
    return 'podcast';
  }
  if (/\bvideoobject\b|video\./.test(hints) && raw.text.length < 2_000) {
    return 'video';
  }
  return raw.text.length > 400 ? 'article' : 'page';
}

/** Posts and files carry their own media; pages make the user choose. */
export function defaultMediaIndex(
  raw: RawSourceCapture,
  kind: ImportedSourceKind,
): number | null {
  if (raw.media[0]?.origin === 'selected') return 0;
  const choices = describeMedia(raw);
  if (kind === 'social') {
    const index = choices.findIndex((choice) => choice.kind !== 'audio');
    return index === -1 ? null : index;
  }
  const wanted: ImportedSourceMediaKind | null =
    kind === 'podcast' || kind === 'audio'
      ? 'audio'
      : kind === 'video'
        ? 'video'
        : kind === 'image'
          ? 'image'
          : null;
  if (!wanted) return null;
  const index = choices.findIndex(
    (choice) => choice.kind === wanted && !choice.label.startsWith('Preview'),
  );
  return index === -1 ? null : index;
}

function sanitizedLine(value: string | undefined, max = 1000): string {
  return sanitizeCaptureText(value ?? '')
    .replace(/\s+/g, ' ')
    .slice(0, max)
    .trim();
}

function authorLabelOf(raw: RawSourceCapture): string {
  const handle = sanitizedLine(raw.authorHandle).replace(/^@/, '');
  const name = sanitizedLine(raw.author);
  if (name && handle) return `${name} @${handle}`;
  return name || (handle ? `@${handle}` : '');
}

export function buildCapturePreview(
  raw: RawSourceCapture,
  kind: ImportedSourceKind = classifySourceKind(raw),
): SourceCapturePreview {
  const text = sanitizeCaptureText(raw.text);
  return {
    authorLabel: authorLabelOf(raw),
    basis: text
      ? raw.isSelection
        ? 'visible_selection'
        : 'visible_page'
      : 'metadata_only',
    excerpt: text.slice(0, EXCERPT_LENGTH),
    host: hostnameOf(pageUrlOf(raw)),
    kind,
    ...(raw.limitation ? { limitation: raw.limitation } : {}),
    media: describeMedia(raw),
    title: sanitizedLine(raw.title, 500) || hostnameOf(pageUrlOf(raw)),
  };
}

/**
 * The only path from a captured page to an Imported source request. Everything
 * is sanitized here, in the background, whatever the page or panel reported.
 */
export function buildSourceSnapshot(
  request: SourceSaveRequest,
): ImportedSourceSnapshotInput {
  const { raw } = request;
  const kind = request.kind ?? classifySourceKind(raw);
  let canonicalUrl: string;
  try {
    canonicalUrl = sanitizeCaptureUrl(pageUrlOf(raw));
  } catch {
    throw new SourceCaptureError('Open an HTTP or HTTPS page to save it.');
  }
  const text = sanitizeCaptureText(raw.text);
  const choices = describeMedia(raw);
  const mediaIndex =
    request.mediaIndex === undefined
      ? defaultMediaIndex(raw, kind)
      : request.mediaIndex;
  const choice = mediaIndex === null ? undefined : choices[mediaIndex];
  if (mediaIndex !== null && !choice) {
    throw new SourceCaptureError('The selected media is no longer available.');
  }
  let selectedMedia: ImportedSourceSnapshotInput['selectedMedia'];
  if (choice) {
    try {
      selectedMedia = {
        availability: choice.availability,
        kind: choice.kind,
        url: sanitizeCaptureUrl(choice.url),
      };
    } catch {
      throw new SourceCaptureError('The selected media link cannot be saved.');
    }
  }
  const handle = sanitizedLine(raw.authorHandle).replace(/^@/, '');
  const name = sanitizedLine(raw.author);
  const candidate = {
    ...(name ? { authorDisplayName: name } : {}),
    ...(handle ? { authorHandle: handle } : {}),
    canonicalUrl,
    capturedText: text,
    clientCapturedAt: new Date().toISOString(),
    contentBasis: text
      ? raw.isSelection
        ? ('visible_selection' as const)
        : ('visible_page' as const)
      : ('metadata_only' as const),
    ...(raw.externalIdentity
      ? { externalIdentity: raw.externalIdentity.slice(0, 255) }
      : {}),
    kind,
    ...(selectedMedia ? { selectedMedia } : {}),
    title: sanitizedLine(raw.title, 1000) || hostnameOf(canonicalUrl),
  };
  const parsed = importedSourceSnapshotInputSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new SourceCaptureError(
      'Genfeed could not read enough from this page to save it. Select the passage you want, or save its link.',
    );
  }
  return parsed.data;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isRawMedia(value: unknown): value is RawMediaCandidate {
  if (value === null || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.url === 'string' &&
    typeof item.kind === 'string' &&
    MEDIA_KINDS.includes(item.kind) &&
    typeof item.origin === 'string' &&
    MEDIA_ORIGINS.includes(item.origin) &&
    isOptionalString(item.label)
  );
}

/** Page scripts and content scripts are untrusted input to the background. */
export function isRawSourceCapture(value: unknown): value is RawSourceCapture {
  if (value === null || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.url === 'string' &&
    typeof raw.title === 'string' &&
    typeof raw.text === 'string' &&
    typeof raw.isSelection === 'boolean' &&
    typeof raw.scope === 'string' &&
    CAPTURE_SCOPES.includes(raw.scope) &&
    (raw.host === undefined ||
      (typeof raw.host === 'string' && CAPTURE_HOSTS.includes(raw.host))) &&
    Array.isArray(raw.typeHints) &&
    raw.typeHints.every((hint) => typeof hint === 'string') &&
    Array.isArray(raw.media) &&
    raw.media.length <= MAX_MEDIA_CANDIDATES &&
    raw.media.every(isRawMedia) &&
    isOptionalString(raw.author) &&
    isOptionalString(raw.authorHandle) &&
    isOptionalString(raw.canonicalUrl) &&
    isOptionalString(raw.externalIdentity) &&
    isOptionalString(raw.limitation) &&
    isOptionalString(raw.siteName)
  );
}
