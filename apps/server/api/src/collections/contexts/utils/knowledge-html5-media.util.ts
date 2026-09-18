import { KnowledgeSourceKind } from '@genfeedai/contracts';
import * as cheerio from 'cheerio';

type KnowledgeHtmlElement = Parameters<cheerio.CheerioAPI>[0];

export const KNOWLEDGE_AUDIO_MIME_TYPES = new Set([
  'audio/flac',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-wav',
]);

export const KNOWLEDGE_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm']);

const AUDIO_EXTENSIONS = new Set([
  '.flac',
  '.m4a',
  '.mp3',
  '.ogg',
  '.wav',
  '.webm',
]);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);

export interface DiscoveredHtml5Media {
  captionUrl?: string;
  isProhibited: boolean;
  mediaUrl?: string;
  reason?: string;
}

function resolveAgainst(
  pageUrl: string,
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value, pageUrl).toString();
  } catch {
    return undefined;
  }
}

function isProhibitedRobots(html: string): boolean {
  const $ = cheerio.load(html);
  const robots = $('meta[name="robots"], meta[name="googlebot"]')
    .map((_, element) => $(element).attr('content') ?? '')
    .get()
    .join(',')
    .toLowerCase();
  return /\bnoai\b/.test(robots) || /\bnoindex\b/.test(robots);
}

function pickCaptionUrl(
  $: cheerio.CheerioAPI,
  element: KnowledgeHtmlElement,
  pageUrl: string,
): string | undefined {
  const tracks = $(element)
    .find('track')
    .toArray()
    .filter((track) => {
      const kind = ($(track).attr('kind') ?? 'subtitles').toLowerCase();
      return kind === 'captions' || kind === 'subtitles';
    });
  const preferred =
    tracks.find((track) => $(track).attr('default') !== undefined) ?? tracks[0];
  return resolveAgainst(
    pageUrl,
    preferred ? $(preferred).attr('src') : undefined,
  );
}

function mediaSrc(
  $: cheerio.CheerioAPI,
  element: KnowledgeHtmlElement,
  pageUrl: string,
): string | undefined {
  const own = resolveAgainst(pageUrl, $(element).attr('src'));
  if (own) {
    return own;
  }
  const source = $(element).find('source').first().attr('src');
  return resolveAgainst(pageUrl, source);
}

export function isDirectKnowledgeMediaMime(
  mimeType: string,
  kind: KnowledgeSourceKind,
): boolean {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (kind === KnowledgeSourceKind.AUDIO) {
    return KNOWLEDGE_AUDIO_MIME_TYPES.has(normalized);
  }
  if (kind === KnowledgeSourceKind.VIDEO) {
    return KNOWLEDGE_VIDEO_MIME_TYPES.has(normalized);
  }
  return false;
}

export function isDirectKnowledgeMediaUrl(
  referenceUrl: string,
  kind: KnowledgeSourceKind,
): boolean {
  try {
    const pathname = new URL(referenceUrl).pathname.toLowerCase();
    const extension = pathname.slice(pathname.lastIndexOf('.'));
    if (kind === KnowledgeSourceKind.AUDIO) {
      return AUDIO_EXTENSIONS.has(extension);
    }
    if (kind === KnowledgeSourceKind.VIDEO) {
      return VIDEO_EXTENSIONS.has(extension);
    }
    return false;
  } catch {
    return false;
  }
}

export function discoverHtml5Media(input: {
  html: string;
  kind: KnowledgeSourceKind;
  pageUrl: string;
}): DiscoveredHtml5Media {
  if (isProhibitedRobots(input.html)) {
    return {
      isProhibited: true,
      reason: 'The page prohibits automated indexing',
    };
  }
  const $ = cheerio.load(input.html);
  const selector = input.kind === KnowledgeSourceKind.AUDIO ? 'audio' : 'video';
  const elements = $(selector).toArray();
  if (elements.length === 0) {
    return {
      isProhibited: false,
      reason: 'No matching media element was found on the page',
    };
  }
  const matches = elements
    .map((element) => ({
      captionUrl: pickCaptionUrl($, element, input.pageUrl),
      mediaUrl: mediaSrc($, element, input.pageUrl),
    }))
    .filter((item) => item.mediaUrl);
  if (matches.length === 0) {
    return {
      isProhibited: false,
      reason: 'The media element has no public source',
    };
  }
  if (matches.length > 1) {
    const exact = matches.find((item) => item.mediaUrl === input.pageUrl);
    if (!exact) {
      return {
        isProhibited: false,
        reason: 'The page has several unrelated media elements',
      };
    }
    return { ...exact, isProhibited: false };
  }
  const single = matches[0];
  return {
    captionUrl: single?.captionUrl,
    isProhibited: false,
    mediaUrl: single?.mediaUrl,
  };
}
