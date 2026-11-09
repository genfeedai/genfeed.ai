import { describe, expect, it } from 'vitest';
import {
  isTerminalTurboRewriteJobStatus,
  isTurboRunSettled,
  TURBO_PROJECT_ITEM_STATE_MACHINE,
  TURBO_RUN_ITEM_STATE_MACHINE,
  TURBO_RUN_STATE_MACHINE,
  TurboProjectItemStatus,
  TurboRewriteJobStatus,
  TurboRunItemStatus,
  TurboRunStatus,
} from './turbo.enum';

describe('TURBO_RUN_STATE_MACHINE', () => {
  it.each([
    [
      TurboRunStatus.PENDING,
      [
        TurboRunStatus.PROCESSING,
        TurboRunStatus.FAILED,
        TurboRunStatus.CANCELLED,
      ],
    ],
    [
      TurboRunStatus.PROCESSING,
      [
        TurboRunStatus.PROCESSING,
        TurboRunStatus.COMPLETED,
        TurboRunStatus.PARTIAL,
        TurboRunStatus.FAILED,
        TurboRunStatus.CANCELLED,
      ],
    ],
    [TurboRunStatus.COMPLETED, []],
    [TurboRunStatus.PARTIAL, []],
    [TurboRunStatus.FAILED, []],
    [TurboRunStatus.CANCELLED, []],
  ])('%s moves to %j', (from, expected) => {
    expect(TURBO_RUN_STATE_MACHINE.next(from)).toEqual(expected);
  });

  it.each([
    [
      TurboRunStatus.PROCESSING,
      [TurboRunStatus.PENDING, TurboRunStatus.PROCESSING],
    ],
    [
      TurboRunStatus.CANCELLED,
      [TurboRunStatus.PENDING, TurboRunStatus.PROCESSING],
    ],
    [TurboRunStatus.PARTIAL, [TurboRunStatus.PROCESSING]],
  ])('%s is reached from %j', (to, expected) => {
    expect(TURBO_RUN_STATE_MACHINE.sourcesOf(to)).toEqual(expected);
  });
});

describe('isTurboRunSettled', () => {
  it.each([
    [TurboRunStatus.COMPLETED, true],
    [TurboRunStatus.PARTIAL, true],
    [TurboRunStatus.FAILED, true],
    [TurboRunStatus.CANCELLED, true],
    [TurboRunStatus.PENDING, false],
    [TurboRunStatus.PROCESSING, false],
  ])('%s -> %s', (status, expected) => {
    expect(isTurboRunSettled(status)).toBe(expected);
  });
});

describe('TURBO_RUN_ITEM_STATE_MACHINE', () => {
  it.each([
    [
      TurboRunItemStatus.PENDING,
      [
        TurboRunItemStatus.PROCESSING,
        TurboRunItemStatus.FAILED,
        TurboRunItemStatus.SKIPPED,
      ],
    ],
    [
      TurboRunItemStatus.PROCESSING,
      [
        TurboRunItemStatus.PENDING,
        TurboRunItemStatus.COMPLETED,
        TurboRunItemStatus.FAILED,
      ],
    ],
    [TurboRunItemStatus.COMPLETED, [TurboRunItemStatus.SKIPPED]],
    [TurboRunItemStatus.FAILED, []],
    [TurboRunItemStatus.SKIPPED, [TurboRunItemStatus.FAILED]],
  ])('%s moves to %j', (from, expected) => {
    expect(TURBO_RUN_ITEM_STATE_MACHINE.next(from)).toEqual(expected);
  });

  it.each([
    [TurboRunItemStatus.PENDING, false],
    [TurboRunItemStatus.PROCESSING, false],
    [TurboRunItemStatus.COMPLETED, true],
    [TurboRunItemStatus.FAILED, true],
    [TurboRunItemStatus.SKIPPED, true],
  ])('%s is terminal: %s', (status, expected) => {
    expect(TURBO_RUN_ITEM_STATE_MACHINE.isTerminal(status)).toBe(expected);
  });
});

describe('TURBO_PROJECT_ITEM_STATE_MACHINE', () => {
  it.each([
    [TurboProjectItemStatus.PENDING, [TurboProjectItemStatus.GENERATING]],
    [
      TurboProjectItemStatus.GENERATING,
      [
        TurboProjectItemStatus.PENDING,
        TurboProjectItemStatus.READY,
        TurboProjectItemStatus.FAILED,
      ],
    ],
    [
      TurboProjectItemStatus.READY,
      [TurboProjectItemStatus.APPROVED, TurboProjectItemStatus.REJECTED],
    ],
    [TurboProjectItemStatus.FAILED, [TurboProjectItemStatus.GENERATING]],
    [
      TurboProjectItemStatus.APPROVED,
      [TurboProjectItemStatus.READY, TurboProjectItemStatus.REJECTED],
    ],
    [
      TurboProjectItemStatus.REJECTED,
      [TurboProjectItemStatus.READY, TurboProjectItemStatus.APPROVED],
    ],
  ])('%s moves to %j', (from, expected) => {
    expect(TURBO_PROJECT_ITEM_STATE_MACHINE.next(from)).toEqual(expected);
  });

  it.each([
    [TurboProjectItemStatus.PENDING, false],
    [TurboProjectItemStatus.GENERATING, false],
    [TurboProjectItemStatus.READY, true],
    [TurboProjectItemStatus.FAILED, true],
    [TurboProjectItemStatus.APPROVED, true],
    [TurboProjectItemStatus.REJECTED, true],
  ])('%s has settled generation: %s', (status, expected) => {
    expect(TURBO_PROJECT_ITEM_STATE_MACHINE.isTerminal(status)).toBe(expected);
  });
});

describe('isTerminalTurboRewriteJobStatus', () => {
  it.each([
    [TurboRewriteJobStatus.QUEUED, false],
    [TurboRewriteJobStatus.PROCESSING, false],
    [TurboRewriteJobStatus.COMPLETED, true],
    [TurboRewriteJobStatus.PARTIALLY_FAILED, true],
    [TurboRewriteJobStatus.FAILED, true],
    [TurboRewriteJobStatus.CANCELLED, true],
  ])('%s is terminal: %s', (status, expected) => {
    expect(isTerminalTurboRewriteJobStatus(status)).toBe(expected);
  });
});
