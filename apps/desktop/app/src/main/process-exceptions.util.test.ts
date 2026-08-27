import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  createDesktopProcessExceptionHandler,
  DESKTOP_PROCESS_EXCEPTION_SOURCE,
} from './process-exceptions.util';

const mainSourcePath = path.resolve(import.meta.dir, '../main.ts');

const createExceptionHarness = ({
  isAppReady = true,
  showFailureScreen = async () => undefined,
}: {
  isAppReady?: boolean;
  showFailureScreen?: (error: unknown) => Promise<void>;
} = {}) => {
  const events: string[] = [];
  const captured: Array<{ error: unknown; source: string }> = [];

  return {
    captured,
    events,
    handler: createDesktopProcessExceptionHandler({
      captureException: (error, context) => {
        captured.push({ error, source: context.source });
      },
      exit: (code) => {
        events.push(`exit:${code}`);
      },
      isAppReady: () => isAppReady,
      showFailureScreen: async (error) => {
        events.push('show-failure');
        await showFailureScreen(error);
      },
      writeError: (message) => {
        events.push(`write:${message.trim()}`);
      },
    }),
  };
};

describe('desktop process exception handling', () => {
  it('ignores broken-stdio EPIPE instead of treating it as a fatal crash', () => {
    const error = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
      fd: 2,
      syscall: 'write',
    });
    const harness = createExceptionHarness();

    harness.handler(error, DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION);

    expect(harness.events).toEqual([
      'write:[desktop] uncaughtException: ignored broken stdio (write EPIPE)',
    ]);
    expect(harness.captured).toEqual([]);
    expect(harness.events).not.toContain('exit:1');
    expect(harness.events).not.toContain('show-failure');
  });

  it('treats a generic I/O code without stdio context as fatal', () => {
    const error = Object.assign(new Error('socket write failed'), {
      code: 'EPIPE',
      syscall: 'write',
    });
    const harness = createExceptionHarness({ isAppReady: false });

    harness.handler(error, DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION);

    expect(harness.captured).toEqual([
      {
        error,
        source: DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION,
      },
    ]);
    expect(harness.events).toContain('exit:1');
  });

  it('terminates immediately when a startup exception happens before app readiness', () => {
    const error = new Error('shell failed before ready');
    const harness = createExceptionHarness({ isAppReady: false });

    harness.handler(error, DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION);

    expect(harness.captured).toEqual([
      {
        error,
        source: DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION,
      },
    ]);
    expect(harness.events[0]).toStartWith(
      'write:[desktop] uncaughtException: Error: shell failed before ready',
    );
    expect(harness.events).toContain('exit:1');
    expect(harness.events).not.toContain('show-failure');
  });

  it('shows the failure screen after readiness instead of continuing silently', async () => {
    const error = new Error('renderer bootstrap exploded');
    const harness = createExceptionHarness();

    harness.handler(
      error,
      DESKTOP_PROCESS_EXCEPTION_SOURCE.UNHANDLED_REJECTION,
    );
    await Promise.resolve();

    expect(harness.captured).toEqual([
      {
        error,
        source: DESKTOP_PROCESS_EXCEPTION_SOURCE.UNHANDLED_REJECTION,
      },
    ]);
    expect(harness.events[0]).toStartWith(
      'write:[desktop] unhandledRejection: Error: renderer bootstrap exploded',
    );
    expect(harness.events).toContain('show-failure');
    expect(harness.events).not.toContain('exit:1');
  });

  it('exits if the failure screen cannot be shown after a ready-state crash', async () => {
    const harness = createExceptionHarness({
      showFailureScreen: async () => {
        throw new Error('failure window unavailable');
      },
    });

    harness.handler(
      new Error('late crash'),
      DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.events[0]).toStartWith(
      'write:[desktop] uncaughtException: Error: late crash',
    );
    expect(harness.events).toContain('show-failure');
    expect(harness.events).toContain('exit:1');
  });

  it('exits on a nested exception instead of re-entering the failure screen', () => {
    const harness = createExceptionHarness({ isAppReady: false });

    harness.handler(
      new Error('first'),
      DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION,
    );
    harness.handler(
      new Error('nested'),
      DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION,
    );

    expect(harness.events.filter((event) => event === 'exit:1')).toEqual([
      'exit:1',
      'exit:1',
    ]);
    expect(harness.events).not.toContain('show-failure');
    expect(harness.captured).toHaveLength(1);
  });

  it('registers process exception handlers before app.whenReady', () => {
    const mainSource = fs.readFileSync(mainSourcePath, 'utf8');
    const handlerSetup = mainSource.indexOf(
      'const handleDesktopProcessException = createDesktopProcessExceptionHandler',
    );
    const whenReady = mainSource.indexOf('.whenReady()');
    const registrationBlock = mainSource.slice(handlerSetup, whenReady);

    expect(handlerSetup).toBeGreaterThan(-1);
    expect(handlerSetup).toBeLessThan(whenReady);
    expect(registrationBlock).toContain(
      'DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION',
    );
    expect(registrationBlock).toContain(
      'DESKTOP_PROCESS_EXCEPTION_SOURCE.UNHANDLED_REJECTION',
    );
    expect(mainSource.slice(whenReady)).not.toContain(
      'createDesktopProcessExceptionHandler',
    );
  });
});
