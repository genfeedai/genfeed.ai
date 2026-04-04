import { lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { globSync } from 'glob';

const logger = new Logger('CheckNestedNodeModules');

/**
 * Check for nested node_modules that are NOT bun workspace symlinks.
 * Bun creates nested node_modules with symlinks for workspace resolution — those are expected.
 * Scoped packages (e.g. @genfeedai/) are real directories containing symlinks — also expected.
 * We only flag directories that contain real, non-symlinked packages.
 */

function hasRealPackages(dir: string): boolean {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }

  return entries.some((entry) => {
    if (
      entry === '.bin' ||
      entry === '.cache' ||
      entry === '.package-lock.json'
    ) {
      return false;
    }

    const entryPath = path.join(dir, entry);
    try {
      const stat = lstatSync(entryPath);

      if (stat.isSymbolicLink()) {
        return false;
      }

      // For scoped package dirs (e.g. @genfeedai/), check their contents recursively
      if (stat.isDirectory() && entry.startsWith('@')) {
        return hasRealPackages(entryPath);
      }

      // Real non-symlink, non-scope directory = problematic
      return true;
    } catch {
      return false;
    }
  });
}

const matches = globSync('packages/*/node_modules', {
  dot: false,
  nodir: false,
});

const problematic: string[] = [];

for (const match of matches) {
  if (hasRealPackages(match)) {
    problematic.push(path.relative(process.cwd(), match));
  }
}

if (problematic.length > 0) {
  logger.error('Found nested node_modules with real (non-symlinked) packages:');
  for (const match of problematic) {
    logger.error(`- ${match}`);
  }
  process.exit(1);
}

logger.log('No problematic nested node_modules found in packages.');
