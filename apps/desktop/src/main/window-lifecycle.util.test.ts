import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  DESKTOP_WINDOW_CLOSE_POLICY,
  handleDesktopWindowClose,
  handleDesktopWindowClosed,
} from './window-lifecycle.util';

const mainSourcePath = path.resolve(import.meta.dir, '../main.ts');

const createCloseHarness = () => {
  const events: string[] = [];

  return {
    actions: {
      hide: () => {
        events.push('hide');
      },
      isQuitting: () => events.includes('quitting'),
      onClosed: () => {
        events.push('closed');
      },
      quit: () => {
        events.push('quit');
      },
    },
    event: {
      preventDefault: () => {
        events.push('preventDefault');
      },
    },
    events,
    markQuitting: () => {
      events.push('quitting');
    },
  };
};

describe('desktop window close lifecycle', () => {
  it('hides the normal window instead of quitting while the app stays alive', () => {
    const harness = createCloseHarness();

    handleDesktopWindowClose(
      DESKTOP_WINDOW_CLOSE_POLICY.HIDE_ON_CLOSE,
      harness.event,
      harness.actions,
    );
    handleDesktopWindowClosed(
      DESKTOP_WINDOW_CLOSE_POLICY.HIDE_ON_CLOSE,
      harness.actions,
    );

    expect(harness.events).toEqual(['preventDefault', 'hide', 'closed']);
  });

  it('lets the normal window close when a real quit is already in progress', () => {
    const harness = createCloseHarness();
    harness.markQuitting();

    handleDesktopWindowClose(
      DESKTOP_WINDOW_CLOSE_POLICY.HIDE_ON_CLOSE,
      harness.event,
      harness.actions,
    );
    handleDesktopWindowClosed(
      DESKTOP_WINDOW_CLOSE_POLICY.HIDE_ON_CLOSE,
      harness.actions,
    );

    expect(harness.events).toEqual(['quitting', 'closed']);
  });

  it('lets the startup-failure window close and terminates the trayless process', () => {
    const harness = createCloseHarness();

    handleDesktopWindowClose(
      DESKTOP_WINDOW_CLOSE_POLICY.QUIT_ON_CLOSE,
      harness.event,
      harness.actions,
    );
    handleDesktopWindowClosed(
      DESKTOP_WINDOW_CLOSE_POLICY.QUIT_ON_CLOSE,
      harness.actions,
    );

    expect(harness.events).toEqual(['closed', 'quit']);
  });

  it('does not double-exit if the failure window closes during an in-flight quit', () => {
    const harness = createCloseHarness();
    harness.markQuitting();

    handleDesktopWindowClose(
      DESKTOP_WINDOW_CLOSE_POLICY.QUIT_ON_CLOSE,
      harness.event,
      harness.actions,
    );
    handleDesktopWindowClosed(
      DESKTOP_WINDOW_CLOSE_POLICY.QUIT_ON_CLOSE,
      harness.actions,
    );

    expect(harness.events).toEqual(['quitting', 'closed']);
  });

  it('wires the startup-failure path to quit-on-close instead of hide-on-close', () => {
    const mainSource = fs.readFileSync(mainSourcePath, 'utf8');
    const failureFnStart = mainSource.indexOf(
      'const showDesktopStartupFailure',
    );
    const nextFnStart = mainSource.indexOf('const openAndActivateWorkspace');
    const failureFn = mainSource.slice(failureFnStart, nextFnStart);

    expect(failureFnStart).toBeGreaterThan(-1);
    expect(nextFnStart).toBeGreaterThan(failureFnStart);
    expect(failureFn).toContain('DESKTOP_WINDOW_CLOSE_POLICY.QUIT_ON_CLOSE');
    expect(failureFn).not.toContain('mainWindow?.hide()');
    expect(failureFn).not.toMatch(/if\s*\(\s*!isQuitting\s*\)/);
  });
});
