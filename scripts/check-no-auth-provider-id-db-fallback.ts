/**
 * Guardrail: prevent legacy auth provider ID fallback usage in DB identity paths.
 *
 * Fails CI/dev checks when known anti-patterns are reintroduced, e.g.:
 * - publicMetadata.user || publicMetadata.authProviderId
 * - publicMetadata.authProviderId || publicMetadata.user
 */

import { spawnSync } from 'node:child_process';

const patterns = [
  'publicMetadata\\.user\\s*\\|\\|\\s*publicMetadata\\.authProviderId',
  'publicMetadata\\.authProviderId\\s*\\|\\|\\s*publicMetadata\\.user',
];

const args = [
  '-n',
  patterns.join('|'),
  'apps/server/api/src',
  '--glob',
  '*.ts',
];

const result = spawnSync('rg', args, {
  encoding: 'utf8',
  stdio: 'pipe',
});

if (result.status === 1) {
  console.log('No legacy auth provider ID fallback patterns detected.');
  process.exit(0);
}

if (result.status !== 0) {
  console.error('Failed to run pattern guard.');
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

console.error(
  'Disallowed legacy auth provider ID fallback pattern(s) detected:\n',
);
console.error(result.stdout);
process.exit(1);
