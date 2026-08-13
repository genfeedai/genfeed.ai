import { describe, expect, it } from 'vitest';
import {
  createComposerFollowUp,
  enqueueComposerFollowUp,
  moveComposerFollowUp,
  removeComposerFollowUp,
  takeNextComposerFollowUp,
} from './composer-follow-up-queue.util';

describe('composer-follow-up-queue', () => {
  it('creates a trimmed follow-up with a stable id', () => {
    const item = createComposerFollowUp(
      '  ship the remix  ',
      {},
      () => 'follow-up-1',
      () => '2026-08-13T00:00:00.000Z',
    );

    expect(item).toEqual({
      content: 'ship the remix',
      createdAt: '2026-08-13T00:00:00.000Z',
      id: 'follow-up-1',
    });
  });

  it('ignores empty follow-ups on enqueue', () => {
    const empty = createComposerFollowUp('   ', {}, () => 'empty');
    expect(enqueueComposerFollowUp([], empty)).toEqual([]);
  });

  it('appends, removes, reorders, and dequeues in FIFO order', () => {
    const first = createComposerFollowUp('one', {}, () => 'a');
    const second = createComposerFollowUp('two', {}, () => 'b');
    const third = createComposerFollowUp('three', {}, () => 'c');

    let queue = enqueueComposerFollowUp([], first);
    queue = enqueueComposerFollowUp(queue, second);
    queue = enqueueComposerFollowUp(queue, third);
    expect(queue.map((item) => item.id)).toEqual(['a', 'b', 'c']);

    queue = removeComposerFollowUp(queue, 'b');
    expect(queue.map((item) => item.id)).toEqual(['a', 'c']);

    queue = moveComposerFollowUp(queue, 1, 0);
    expect(queue.map((item) => item.id)).toEqual(['c', 'a']);

    const taken = takeNextComposerFollowUp(queue);
    expect(taken.next?.id).toBe('c');
    expect(taken.remaining.map((item) => item.id)).toEqual(['a']);
  });

  it('no-ops out-of-range moves', () => {
    const item = createComposerFollowUp('one', {}, () => 'a');
    const queue = enqueueComposerFollowUp([], item);
    expect(moveComposerFollowUp(queue, 0, 4)).toEqual(queue);
  });
});
