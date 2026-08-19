import { runDetachedCommand } from '../dev/terminate-child-tree';
import { watchExtensionThemeCss } from './build-extension-theme-css';

const stopThemeWatch = await watchExtensionThemeCss();

try {
  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const exitCode = await runDetachedCommand(
    [npmExecutable, 'exec', 'plasmo', 'dev'],
    process.env,
  );
  process.exitCode = exitCode;
} finally {
  stopThemeWatch();
}
