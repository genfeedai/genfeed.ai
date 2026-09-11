/**
 * check-no-story-files.ts — Storybook is not installed, so a story file has no
 * runner and is dead code the moment it lands.
 *
 * Fails when any tracked `*.stories.*` file exists. Render a component in
 * isolation with a Vitest + Testing Library spec instead.
 */

import { spawnSync } from 'node:child_process';

const logger = {
  error: (message: string) => console.error(`[no-story-files] ${message}`),
  log: (message: string) => console.log(`[no-story-files] ${message}`),
};

const STORY_FILE_PATTERN = /\.stories\.(?:[cm]?[jt]sx?|mdx)$/;

// Filter with a pathspec so git returns only candidates; the full file list
// exceeds spawnSync's default output buffer on this repository.
const result = spawnSync('git', ['ls-files', '--', '*.stories.*'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (result.error || result.status !== 0) {
  logger.error('git ls-files failed; cannot check for story files.');
  process.exit(1);
}

const storyFiles = result.stdout
  .split('\n')
  .filter((file) => STORY_FILE_PATTERN.test(file));

if (storyFiles.length > 0) {
  logger.error(
    `${storyFiles.length} story file(s) found. Storybook is not installed; cover the component with a Vitest + Testing Library spec instead.`,
  );
  for (const file of storyFiles) {
    logger.error(`  - ${file}`);
  }
  process.exit(1);
}

logger.log('No story files.');
