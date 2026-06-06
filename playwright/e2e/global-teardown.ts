import { rm, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Global Teardown for Playwright E2E Tests
 *
 * Turbopack's persistent dev cache (`apps/app/.next/dev/cache`) is written on
 * every dev-server route compile and is never pruned by Next itself. Across
 * repeated E2E runs it stockpiles unbounded — observed at ~15 GB on the runner,
 * which exhausted the disk mid-run and crashed the dev server with
 * `No space left on device (os error 28)`.
 *
 * This teardown removes that cache after each run so it can never accumulate.
 * It is intentionally cache-only: the compiled output is regenerated on the next
 * run's first route hit, so deleting it costs a one-time recompile and nothing
 * else. Failures here must never fail the suite — teardown is best-effort.
 *
 * Resolves the app path the same way `playwright.config.ts` does, so a custom
 * `PLAYWRIGHT_WEB_APP_PATH` is honored.
 */

async function dirSizeBytes(target: string): Promise<number> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);
    const { stdout } = await run('du', ['-sk', target]);
    const kb = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '0', 10);
    return Number.isFinite(kb) ? kb * 1024 : 0;
  } catch {
    return 0;
  }
}

async function globalTeardown(): Promise<void> {
  const webAppPath = path.resolve(
    process.cwd(),
    process.env.PLAYWRIGHT_WEB_APP_PATH || 'apps/app',
  );
  const devCacheDir = path.join(webAppPath, '.next', 'dev', 'cache');

  try {
    await stat(devCacheDir);
  } catch {
    // Nothing stockpiled — clean exit.
    return;
  }

  const freedBytes = await dirSizeBytes(devCacheDir);
  try {
    await rm(devCacheDir, { force: true, recursive: true });
    const freedMb = (freedBytes / (1024 * 1024)).toFixed(1);
    console.log(
      `\n[e2e teardown] Cleared Turbopack dev cache (${freedMb} MB): ${devCacheDir}`,
    );
  } catch (error) {
    console.warn(
      `[e2e teardown] Failed to clear dev cache at ${devCacheDir}: ${String(error)}`,
    );
  }
}

export default globalTeardown;
