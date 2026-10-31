import { describe, expect, it } from 'bun:test';
import './test-support/electron.mock';

const { writeDesktopAppShellError } = await import('./app-shell.service');

describe('desktop app shell diagnostics', () => {
  it('writes failures to stderr and the persistent diagnostic log', () => {
    const stderrMessages: string[] = [];
    const persistentMessages: Array<{ level: string; message: string }> = [];
    const message = '[desktop-app] bundled shell exited\n';

    writeDesktopAppShellError(
      message,
      (level, loggedMessage) => {
        persistentMessages.push({ level, message: loggedMessage });
      },
      (stderrMessage) => {
        stderrMessages.push(stderrMessage);
      },
    );

    expect(stderrMessages).toEqual([message]);
    expect(persistentMessages).toEqual([{ level: 'error', message }]);
  });
});
