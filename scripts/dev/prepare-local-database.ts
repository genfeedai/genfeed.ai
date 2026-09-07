import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function isLocalDevelopmentDatabase(
  environment: NodeJS.ProcessEnv,
): boolean {
  if (environment.NODE_ENV && environment.NODE_ENV !== 'development')
    return false;
  try {
    const url = new URL(environment.DATABASE_URL ?? '');
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !['host', 'hostaddr', 'service'].some((key) => url.searchParams.has(key))
    );
  } catch {
    return false;
  }
}

export function prepareLocalDatabase(
  workspaceRoot: string,
  environment: NodeJS.ProcessEnv,
  runCommand?: (args: string[]) => void,
): void {
  if (!isLocalDevelopmentDatabase(environment)) {
    console.info(
      '[dev:database] Skipping automatic database preparation: only local development PostgreSQL URLs are supported.',
    );
    return;
  }
  const cwd = path.join(workspaceRoot, 'packages/prisma');
  const prismaCli = path.join(cwd, 'node_modules/prisma/build/index.js');
  const run =
    runCommand ??
    ((args: string[]) => {
      const result = spawnSync(process.execPath, [prismaCli, ...args], {
        cwd,
        env: environment,
        stdio: 'inherit',
      });
      if (result.error || result.status !== 0) {
        throw new Error(
          `Local database preparation failed (${args.join(' ')}). API startup stopped.`,
          { cause: result.error },
        );
      }
    });
  console.info(
    '[dev:database] Applying local migrations and generating Prisma client.',
  );
  run(['migrate', 'deploy']);
  run(['generate']);
}
