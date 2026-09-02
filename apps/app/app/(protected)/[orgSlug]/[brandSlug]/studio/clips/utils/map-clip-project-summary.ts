import { isClipResultMode } from '@genfeedai/contracts/interfaces';
import type { ClipProjectSummary } from '@props/studio/clips.props';

import { clipProjectTitle } from './youtube-thumbnail';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function mapClipProjectSummary(
  item: {
    attributes?: unknown;
    id: string;
  } & Record<string, unknown>,
): ClipProjectSummary {
  const attrs: Record<string, unknown> = isRecord(item.attributes)
    ? item.attributes
    : item;
  const settings = isRecord(attrs.settings) ? attrs.settings : undefined;
  const sourceVideoUrl = readString(attrs.sourceVideoUrl);

  return {
    brandId: readString(attrs.brandId),
    createdAt: readString(attrs.createdAt),
    failedClipCount: readNumber(attrs.failedClipCount),
    id: item.id,
    mode: isClipResultMode(settings?.mode) ? settings.mode : undefined,
    name: clipProjectTitle(readString(attrs.name), sourceVideoUrl),
    pendingClipCount: readNumber(attrs.pendingClipCount),
    progress: readNumber(attrs.progress),
    readyClipCount: readNumber(attrs.readyClipCount),
    sourceVideoUrl,
    status: readString(attrs.status) ?? 'pending',
  };
}
