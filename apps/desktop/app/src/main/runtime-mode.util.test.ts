import { describe, expect, it } from 'bun:test';
import {
  activateDesktopLocalMode,
  selectDesktopDataService,
  switchDesktopToCloud,
} from './runtime-mode.util';

describe('desktop runtime mode transitions', () => {
  it('does not persist local mode when runtime initialization fails', async () => {
    let persisted = false;

    await expect(
      activateDesktopLocalMode(
        async () => {
          throw new Error('database unavailable');
        },
        () => {
          persisted = true;
        },
      ),
    ).rejects.toThrow('database unavailable');

    expect(persisted).toBe(false);
  });

  it('never falls back to cloud while local mode is active', () => {
    const cloudService = { mode: 'cloud' };

    expect(() =>
      selectDesktopDataService({
        cloudService,
        hasCloudSession: true,
        isOfflineMode: true,
        localService: null,
      }),
    ).toThrow('The local runtime is not ready.');
  });

  it('closes the local runtime before relaunching in cloud mode', async () => {
    const events: string[] = [];

    await switchDesktopToCloud({
      closeLocalRuntime: async () => {
        events.push('close');
      },
      exit: () => {
        events.push('exit');
      },
      persistCloudMode: () => {
        events.push('persist');
      },
      relaunch: () => {
        events.push('relaunch');
      },
    });

    expect(events).toEqual(['close', 'persist', 'relaunch', 'exit']);
  });
});
