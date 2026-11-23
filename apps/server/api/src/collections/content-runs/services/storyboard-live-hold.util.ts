import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { STORYBOARD_ASSET_SOURCE_ACTION_PREFIX } from '@genfeedai/contracts/api-types/contracts/storyboard-asset-bible.contract';
import { STORYBOARD_RUN_CONTRACT } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { STORYBOARD_SHOT_RENDER_SOURCE_ACTION_PREFIX } from '@genfeedai/contracts/api-types/contracts/storyboard-shot-render.contract';
import { STORYBOARD_STILL_SOURCE_ACTION_PREFIX } from '@genfeedai/contracts/api-types/contracts/storyboard-still.contract';

/**
 * Only runs touched in this window keep a live journal operation's hold. A paid
 * hold lives two hours, so an operation still live after three days belongs to
 * a run nobody will reopen: its hold expires like any other.
 */
export const STORYBOARD_JOURNAL_LIVE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** `randomUUID()` length: the tail of every storyboard source action id. */
const OPERATION_ID_LENGTH = 36;

const JOURNAL_BY_PREFIX = [
  [STORYBOARD_STILL_SOURCE_ACTION_PREFIX, 'stillOperations'],
  [STORYBOARD_SHOT_RENDER_SOURCE_ACTION_PREFIX, 'shotRenderOperations'],
  [STORYBOARD_ASSET_SOURCE_ACTION_PREFIX, 'assetOperations'],
] as const;

/**
 * True while the paid storyboard journal operation that keyed this hold has no
 * provider verdict yet, so only the journal reconcilers may settle or release
 * it. The generic expiry must never decide for them: a render that finished
 * while the creator was away is charged by the reconciler, and a sweep that
 * did not reach the run this tick, or threw, must not cost the hold (#10449).
 *
 * A source action id is `<prefix><runId>-<operationId>`, and every hold the
 * image and video pipelines open for a journal operation is keyed by it.
 */
export async function isLiveStoryboardHold(
  prisma: Pick<PrismaService, 'contentRun'>,
  reservation: { organizationId: string; workloadId: string | null },
  now: Date = new Date(),
): Promise<boolean> {
  const workloadId = reservation.workloadId;
  if (!workloadId) return false;
  const match = JOURNAL_BY_PREFIX.find(([prefix]) =>
    workloadId.startsWith(prefix),
  );
  if (!match) return false;
  const [prefix, journal] = match;
  const rest = workloadId.slice(prefix.length);
  const runId = rest.slice(0, -(OPERATION_ID_LENGTH + 1));
  const operationId = rest.slice(-OPERATION_ID_LENGTH);
  if (!runId || rest.at(-(OPERATION_ID_LENGTH + 1)) !== '-') return false;
  const run = await prisma.contentRun.findFirst({
    select: { id: true },
    where: {
      id: runId,
      organizationId: reservation.organizationId,
      isDeleted: false,
      contract: STORYBOARD_RUN_CONTRACT,
      updatedAt: {
        gte: new Date(now.getTime() - STORYBOARD_JOURNAL_LIVE_WINDOW_MS),
      },
      OR: (['pending', 'submitted'] as const).map((state) => ({
        config: { path: [journal], array_contains: [{ operationId, state }] },
      })),
    },
  });
  return run !== null;
}
