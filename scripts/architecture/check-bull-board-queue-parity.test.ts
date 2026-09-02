import { describe, expect, it } from 'vitest';
import { runCheckBullBoardQueueParity } from './check-bull-board-queue-parity';

const canonicalConfig = `
  import { ALL_QUEUE_NAMES } from '@genfeedai/contracts/queue';
  export const BULL_BOARD_AUXILIARY_QUEUE_NAMES = ['file-processing'] as const;
  export const BULL_BOARD_QUEUE_NAMES = [
    ...ALL_QUEUE_NAMES,
    ...BULL_BOARD_AUXILIARY_QUEUE_NAMES,
  ] as const;
`;
const canonicalMain = `
  createBullBoard({
    queues: BULL_BOARD_QUEUE_NAMES.map((name) => createAdapter(name)),
  });
`;

describe('check-bull-board-queue-parity', () => {
  it('accepts canonical contract composition and runtime wiring', () => {
    const result = runCheckBullBoardQueueParity({
      configSource: canonicalConfig,
      contractQueueNames: ['default', 'post-publish'],
      mainSource: canonicalMain,
    });

    expect(result.violations).toEqual([]);
    expect(result.auxiliaryQueueNames).toEqual(['file-processing']);
  });

  it('rejects a second hand-maintained monitored list', () => {
    const result = runCheckBullBoardQueueParity({
      configSource: canonicalConfig.replace(
        '...ALL_QUEUE_NAMES,',
        "'default',",
      ),
      contractQueueNames: ['default', 'post-publish'],
      mainSource: canonicalMain,
    });

    expect(result.violations).toContainEqual(
      expect.stringContaining('composed exactly'),
    );
  });

  it('rejects main.ts drift away from the canonical list', () => {
    const result = runCheckBullBoardQueueParity({
      configSource: canonicalConfig,
      contractQueueNames: ['default'],
      mainSource: 'monitoredQueueNames.map((name) => createAdapter(name));',
    });

    expect(result.violations).toContainEqual(
      expect.stringContaining('BULL_BOARD_QUEUE_NAMES.map'),
    );
  });

  it('rejects auxiliary queues that duplicate the shared contract', () => {
    const result = runCheckBullBoardQueueParity({
      configSource: canonicalConfig,
      contractQueueNames: ['default', 'file-processing'],
      mainSource: canonicalMain,
    });

    expect(result.violations).toContainEqual(
      expect.stringContaining('duplicates: file-processing'),
    );
  });

  it('rejects non-literal auxiliary queue entries', () => {
    const result = runCheckBullBoardQueueParity({
      configSource: canonicalConfig.replace(
        "['file-processing']",
        '[SERVICE_QUEUE_NAME]',
      ),
      contractQueueNames: ['default'],
      mainSource: canonicalMain,
    });

    expect(result.violations).toContainEqual(
      expect.stringContaining('only string literals'),
    );
  });
});
