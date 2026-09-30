import { describe, expect, it } from 'vitest';
import {
  COMPOSER_FOLLOW_UP_QUEUE_CAPACITY,
  createComposerFollowUp,
  enqueueComposerFollowUp,
  getComposerFollowUpQueue,
  getOldestDispatchableComposerFollowUp,
  hasFailedComposerFollowUp,
  hasSendingComposerFollowUp,
  markComposerFollowUpStatus,
  migrateUnassignedComposerFollowUpQueue,
  moveComposerFollowUp,
  removeComposerFollowUp,
  setComposerFollowUpQueue,
  takeNextComposerFollowUp,
} from './composer-follow-up-queue.util';

function followUp(
  content: string,
  id: string,
  threadId: string | null = 'thread-1',
) {
  return createComposerFollowUp(
    content,
    { threadId },
    () => id,
    () => '2026-08-13T00:00:00.000Z',
  );
}

describe('composer-follow-up-queue', () => {
  it('creates a trimmed follow-up with queued status and thread id', () => {
    const item = followUp('  ship the remix  ', 'follow-up-1');

    expect(item).toEqual({
      content: 'ship the remix',
      createdAt: '2026-08-13T00:00:00.000Z',
      id: 'follow-up-1',
      status: 'queued',
      threadId: 'thread-1',
    });
  });

  it('ignores empty follow-ups on enqueue', () => {
    const empty = followUp('   ', 'empty');
    expect(enqueueComposerFollowUp([], empty)).toEqual({
      accepted: false,
      queue: [],
      reason: 'empty',
    });
  });

  it('rejects enqueue at the configured capacity without dropping the queue', () => {
    let queue = [] as ReturnType<typeof followUp>[];
    for (let index = 0; index < COMPOSER_FOLLOW_UP_QUEUE_CAPACITY; index += 1) {
      const result = enqueueComposerFollowUp(
        queue,
        followUp(`prompt-${index}`, `id-${index}`),
      );
      expect(result.accepted).toBe(true);
      queue = result.queue;
    }

    const overflow = enqueueComposerFollowUp(
      queue,
      followUp('too many', 'overflow'),
    );
    expect(overflow).toEqual({
      accepted: false,
      queue,
      reason: 'capacity',
    });
    expect(overflow.queue).toHaveLength(COMPOSER_FOLLOW_UP_QUEUE_CAPACITY);
  });

  it('appends, removes, reorders, and dequeues in FIFO order', () => {
    const first = followUp('one', 'a');
    const second = followUp('two', 'b');
    const third = followUp('three', 'c');

    let result = enqueueComposerFollowUp([], first);
    result = enqueueComposerFollowUp(result.queue, second);
    result = enqueueComposerFollowUp(result.queue, third);
    expect(result.queue.map((item) => item.id)).toEqual(['a', 'b', 'c']);

    const afterRemove = removeComposerFollowUp(result.queue, 'b');
    expect(afterRemove.map((item) => item.id)).toEqual(['a', 'c']);

    const afterMove = moveComposerFollowUp(afterRemove, 1, 0);
    expect(afterMove.map((item) => item.id)).toEqual(['c', 'a']);

    const taken = takeNextComposerFollowUp(afterMove);
    expect(taken.next?.id).toBe('c');
    expect(taken.remaining.map((item) => item.id)).toEqual(['a']);
  });

  it('no-ops out-of-range moves', () => {
    const item = followUp('one', 'a');
    const queued = enqueueComposerFollowUp([], item).queue;
    expect(moveComposerFollowUp(queued, 0, 4)).toEqual(queued);
  });

  it('does not auto-dispatch a failed or sending head so later items cannot leapfrog', () => {
    const first = markComposerFollowUpStatus(
      [followUp('one', 'a')],
      'a',
      'failed',
    );
    const withSecond = enqueueComposerFollowUp(
      first,
      followUp('two', 'b'),
    ).queue;

    expect(getOldestDispatchableComposerFollowUp(withSecond)).toBeNull();
    expect(hasFailedComposerFollowUp(withSecond)).toBe(true);

    const sending = markComposerFollowUpStatus(withSecond, 'a', 'sending');
    expect(getOldestDispatchableComposerFollowUp(sending)).toBeNull();
    expect(hasSendingComposerFollowUp(sending)).toBe(true);

    const retried = markComposerFollowUpStatus(sending, 'a', 'queued');
    expect(getOldestDispatchableComposerFollowUp(retried)?.id).toBe('a');
  });

  it('keeps per-thread queues isolated and migrates an unassigned queue onto a new thread', () => {
    const threadOne = enqueueComposerFollowUp(
      [],
      followUp('from thread one', 'a', 'thread-1'),
    ).queue;
    const unassigned = enqueueComposerFollowUp(
      [],
      followUp('from new chat', 'b', null),
    ).queue;

    let queues = setComposerFollowUpQueue({}, 'thread-1', threadOne);
    queues = setComposerFollowUpQueue(queues, null, unassigned);

    expect(
      getComposerFollowUpQueue(queues, 'thread-1').map((item) => item.id),
    ).toEqual(['a']);
    expect(
      getComposerFollowUpQueue(queues, null).map((item) => item.id),
    ).toEqual(['b']);

    queues = migrateUnassignedComposerFollowUpQueue(queues, 'thread-2');
    expect(getComposerFollowUpQueue(queues, null)).toEqual([]);
    expect(
      getComposerFollowUpQueue(queues, 'thread-2').map((item) => item.threadId),
    ).toEqual(['thread-2']);
    expect(
      getComposerFollowUpQueue(queues, 'thread-1').map((item) => item.id),
    ).toEqual(['a']);
  });
});
