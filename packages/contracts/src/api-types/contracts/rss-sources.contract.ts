import { z } from 'zod';
import { RssApprovalMode, RssImportPolicy } from '../..';

export const rssTargetChannelSchema = z.object({
  credentialId: z.string().min(1),
  platform: z.string().min(1),
  signatureId: z.string().min(1).optional(),
});

export const persistRssSourceInputSchema = z.object({
  approvalMode: z.nativeEnum(RssApprovalMode).default(RssApprovalMode.APPROVAL),
  brandId: z.string().min(1).optional(),
  feedUrl: z.string().url(),
  importPolicy: z.nativeEnum(RssImportPolicy).default(RssImportPolicy.DRAFT),
  isEnabled: z.boolean().optional(),
  label: z.string().min(1).max(120),
  targetChannels: z.array(rssTargetChannelSchema).min(1),
  timezone: z.string().min(1).default('UTC'),
});

export const updateRssSourceInputSchema = persistRssSourceInputSchema.partial();

export type PersistRssSourceInput = z.infer<typeof persistRssSourceInputSchema>;
export type UpdateRssSourceInput = z.infer<typeof updateRssSourceInputSchema>;
export type RssTargetChannel = z.infer<typeof rssTargetChannelSchema>;

export interface ParsedRssFeedItem {
  guid: string;
  imageUrl: string | null;
  publishedAt: string | null;
  summary: string | null;
  title: string;
  url: string;
}

function decodeCdataSections(value: string): string {
  const prefix = '<![CDATA[';
  const suffix = ']]>';
  let result = '';
  let cursor = 0;

  while (cursor < value.length) {
    const start = value.indexOf(prefix, cursor);
    if (start === -1) {
      result += value.slice(cursor);
      break;
    }
    result += value.slice(cursor, start);
    const contentStart = start + prefix.length;
    const end = value.indexOf(suffix, contentStart);
    if (end === -1) {
      result += value.slice(start);
      break;
    }
    result += value.slice(contentStart, end);
    cursor = end + suffix.length;
  }

  return result;
}

function decodeXmlEntities(value: string): string {
  return decodeCdataSections(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function firstTag(xml: string, tag: string): string | null {
  const match = xml.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  );
  return match?.[1] ? decodeXmlEntities(match[1]) : null;
}

function firstAttribute(
  xml: string,
  tag: string,
  attribute: string,
): string | null {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*\\s${attribute}=["']([^"']+)["'][^>]*\\/?>`, 'i'),
  );
  return match?.[1] ? decodeXmlEntities(match[1]) : null;
}

function collectBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    'gi',
  );
  let match = pattern.exec(xml);
  while (match) {
    blocks.push(match[1] ?? '');
    match = pattern.exec(xml);
  }
  return blocks;
}

function toIsoDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseRss20Items(xml: string): ParsedRssFeedItem[] {
  return collectBlocks(xml, 'item').flatMap((block) => {
    const url = firstTag(block, 'link') ?? firstTag(block, 'guid');
    const title = firstTag(block, 'title');
    if (!url || !title) {
      return [];
    }
    const guid = firstTag(block, 'guid') ?? url;
    const enclosureImage = firstAttribute(block, 'enclosure', 'url');
    const mediaImage = firstAttribute(block, 'media:content', 'url');
    return [
      {
        guid,
        imageUrl: mediaImage ?? enclosureImage,
        publishedAt: toIsoDate(
          firstTag(block, 'pubDate') ?? firstTag(block, 'dc:date'),
        ),
        summary: firstTag(block, 'description'),
        title,
        url,
      },
    ];
  });
}

function parseAtomItems(xml: string): ParsedRssFeedItem[] {
  return collectBlocks(xml, 'entry').flatMap((block) => {
    const url = firstAttribute(block, 'link', 'href') ?? firstTag(block, 'id');
    const title = firstTag(block, 'title');
    if (!url || !title) {
      return [];
    }
    const guid = firstTag(block, 'id') ?? url;
    return [
      {
        guid,
        imageUrl: firstAttribute(block, 'media:thumbnail', 'url'),
        publishedAt: toIsoDate(
          firstTag(block, 'updated') ?? firstTag(block, 'published'),
        ),
        summary: firstTag(block, 'summary') ?? firstTag(block, 'content'),
        title,
        url,
      },
    ];
  });
}

export function parseRssFeed(xml: string): ParsedRssFeedItem[] {
  if (!xml.trim()) {
    return [];
  }
  if (/<entry[\s>]/i.test(xml)) {
    return parseAtomItems(xml);
  }
  return parseRss20Items(xml);
}

export function rssItemDedupeKey(
  sourceId: string,
  item: ParsedRssFeedItem,
): string {
  return `${sourceId}:${item.guid}`;
}
