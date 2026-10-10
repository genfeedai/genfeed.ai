import type {
  ReviewInboxItemSummary,
  TurboRunItemFull,
} from '@api/services/turbo-run/turbo-run.types';
import { ReviewDecision, TurboRunItemStatus } from '@genfeedai/contracts';
import type { VideoContinuityQaReport } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

export function toReviewInboxItemSummary(row: {
  turboRunId: string;
  createdAt: Date;
  data: Prisma.JsonValue;
  id: string;
  status: string;
}): ReviewInboxItemSummary {
  const data =
    typeof row.data === 'object' &&
    row.data !== null &&
    !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : {};
  const format = typeof data.format === 'string' ? data.format : 'image';
  const caption = typeof data.caption === 'string' ? data.caption : undefined;
  const prompt = typeof data.prompt === 'string' ? data.prompt : undefined;

  return {
    turboRunId: row.turboRunId,
    createdAt: row.createdAt.toISOString(),
    format,
    id: row.id,
    mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
    platform: typeof data.platform === 'string' ? data.platform : undefined,
    postId: typeof data.postId === 'string' ? data.postId : undefined,
    reviewDecision: ReviewDecision.UNSET,
    status: row.status,
    summary:
      caption ??
      prompt ??
      `${format.charAt(0).toUpperCase()}${format.slice(1)} ready for review`,
    continuityQa: isContinuityQaReport(data.continuityQa)
      ? data.continuityQa
      : undefined,
  };
}

export function getSelectedPostIds(
  turboRunItems: TurboRunItemFull[],
  itemIdSet: Set<string>,
): string[] {
  return [
    ...new Set(
      turboRunItems
        .filter(
          (item) =>
            itemIdSet.has(item.id) &&
            item.status === TurboRunItemStatus.COMPLETED &&
            item.reviewDecision !== ReviewDecision.APPROVED &&
            Boolean(item.postId),
        )
        .flatMap((item) => (item.postId ? [item.postId] : [])),
    ),
  ];
}

function isContinuityQaReport(
  value: unknown,
): value is VideoContinuityQaReport {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).schemaVersion === 1 &&
    Array.isArray((value as Record<string, unknown>).clips)
  );
}
