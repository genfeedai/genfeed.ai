import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Entry = [level: string, message: string, context: unknown];

/** What reached the full logger, in order. */
const written = vi.hoisted(() => [] as Entry[]);
const logger = vi.hoisted(() => {
  const level =
    (name: string) =>
    (message: string, context?: unknown): void => {
      written.push([name, message, context]);
    };
  return {
    debug: level('debug'),
    error: level('error'),
    info: level('info'),
    warn: level('warn'),
  };
});

beforeEach(() => {
  written.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('./logger.service');
  vi.resetModules();
});

describe('deferredLogger', () => {
  it('forwards every call to the same level of the full logger', async () => {
    vi.doMock('./logger.service', () => ({ logger }));
    const { deferredLogger } = await import('./deferred-logger');
    const failure = new Error('boom');

    deferredLogger.error('first', { error: failure });
    deferredLogger.warn('second');
    deferredLogger.info('third', { id: 1 });
    deferredLogger.debug('fourth');

    await vi.waitFor(() => expect(written).toHaveLength(4));
    expect(written).toEqual([
      ['error', 'first', { error: failure }],
      ['warn', 'second', undefined],
      ['info', 'third', { id: 1 }],
      ['debug', 'fourth', undefined],
    ]);
  });

  it('keeps the report on the console when the logger fails to load, then retries', async () => {
    const onConsole: Entry[] = [];
    vi.spyOn(console, 'error').mockImplementation(
      (message: string, context?: unknown) => {
        onConsole.push(['error', message, context]);
      },
    );
    let loads = 0;
    vi.doMock('./logger.service', () => {
      loads += 1;
      if (loads === 1) {
        throw new Error('Failed to fetch dynamically imported module');
      }
      return { logger };
    });
    const { deferredLogger } = await import('./deferred-logger');
    const failure = new Error('boom');

    deferredLogger.error('while offline', { error: failure });
    await vi.waitFor(() => expect(onConsole).toHaveLength(1));
    expect(onConsole).toEqual([['error', 'while offline', { error: failure }]]);
    expect(written).toEqual([]);

    deferredLogger.error('back online');
    await vi.waitFor(() =>
      expect(written).toEqual([['error', 'back online', undefined]]),
    );
    expect(onConsole).toHaveLength(1);
  });
});
