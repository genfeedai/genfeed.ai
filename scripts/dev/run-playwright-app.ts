import path from 'node:path';
import { cleanupPlaywrightCache } from './cleanup-playwright-cache';
import { runDetachedCommand } from './terminate-child-tree';

const [appPath, command] = process.argv.slice(2);
if (!appPath || !command) {
  throw new Error('Expected the Playwright app path and server command.');
}
// This wrapper is only launched when Playwright owns a new server. Reused and
// manually managed servers never enter this lifecycle or have their cache removed.
const exitCode = await runDetachedCommand(
  ['/bin/sh', '-c', command],
  process.env,
);
await cleanupPlaywrightCache(path.resolve(appPath));
process.exit(exitCode);
