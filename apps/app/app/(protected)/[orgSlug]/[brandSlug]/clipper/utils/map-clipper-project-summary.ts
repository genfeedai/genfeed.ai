import { isClipperResultMode } from '@genfeedai/contracts/interfaces';
import {
  isRecord,
  readNonBlankString,
} from '@genfeedai/utils/data/extract.util';
import type { ClipperProjectSummary } from '@/props/studio/clipper.props';
import { clipperProjectTitle } from './youtube-thumbnail';

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function mapClipperProjectSummary(
  item: {
    attributes?: unknown;
    id: string;
  } & Record<string, unknown>,
): ClipperProjectSummary {
  const attrs: Record<string, unknown> = isRecord(item.attributes)
    ? item.attributes
    : item;
  const settings = isRecord(attrs.settings) ? attrs.settings : undefined;
  const draft = isRecord(attrs.draft) ? attrs.draft : undefined;
  const status = readNonBlankString(attrs.status) ?? 'pending';
  // A draft has no source yet; its typed YouTube URL still gives a thumbnail.
  const sourceVideoUrl =
    readNonBlankString(attrs.sourceVideoUrl) ??
    readNonBlankString(draft?.youtubeUrl);

  return {
    brandId: readNonBlankString(attrs.brandId),
    createdAt: readNonBlankString(attrs.createdAt),
    updatedAt: readNonBlankString(attrs.updatedAt),
    failedClipCount: readNumber(attrs.failedClipCount),
    id: item.id,
    isDraft: status === 'draft',
    mode: isClipperResultMode(settings?.mode) ? settings.mode : undefined,
    name: clipperProjectTitle(readNonBlankString(attrs.name), sourceVideoUrl),
    pendingClipCount: readNumber(attrs.pendingClipCount),
    progress: readNumber(attrs.progress),
    readyClipCount: readNumber(attrs.readyClipCount),
    sourceVideoUrl,
    status,
  };
}
