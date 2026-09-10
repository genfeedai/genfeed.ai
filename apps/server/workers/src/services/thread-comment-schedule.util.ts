/**
 * Planning rules for the follow-ups scheduled behind a post.
 *
 * A creator schedules a post and hangs comments off it, each with its own
 * delay: "publish this one straight away, that one ten minutes later". The
 * publish worker sends the immediate ones inline, while the delayed ones are
 * stamped with a due date and picked up later by the thread-comment sweep.
 */

import { normalizeThreadDelayMinutes } from '@genfeedai/contracts/api-types/contracts';

export type ThreadChildScheduleInput = {
  id: string;
  order?: number | null;
  threadDelayMinutes?: number | null;
};

export type DelayedThreadChild<TChild extends ThreadChildScheduleInput> = {
  child: TChild;
  dueAt: Date;
  /** Minutes after the parent went live, after monotonic ordering. */
  delayMinutes: number;
};

export type ThreadChildDeliveryPlan<TChild extends ThreadChildScheduleInput> = {
  immediate: TChild[];
  delayed: Array<DelayedThreadChild<TChild>>;
};

const MINUTE_MS = 60_000;

/**
 * Split follow-ups into what goes out with the parent and what waits.
 *
 * Order is the contract: a comment never overtakes the one before it. So the
 * first delayed child parks every later child too, and each delay is raised to
 * its predecessor's when a creator enters a smaller one further down.
 */
export function planThreadChildDelivery<
  TChild extends ThreadChildScheduleInput,
>(
  children: TChild[],
  parentPublishedAt: Date,
): ThreadChildDeliveryPlan<TChild> {
  const sorted = [...children].sort((a, b) => (a.order || 0) - (b.order || 0));

  const immediate: TChild[] = [];
  const delayed: Array<DelayedThreadChild<TChild>> = [];
  let previousDelayMinutes = 0;

  for (const child of sorted) {
    const requestedDelay = normalizeThreadDelayMinutes(
      child.threadDelayMinutes,
    );
    const delayMinutes = Math.max(requestedDelay, previousDelayMinutes);

    if (delayMinutes === 0) {
      immediate.push(child);
      continue;
    }

    delayed.push({
      child,
      delayMinutes,
      dueAt: new Date(parentPublishedAt.getTime() + delayMinutes * MINUTE_MS),
    });
    previousDelayMinutes = delayMinutes;
  }

  return { delayed, immediate };
}
