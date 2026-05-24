import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';

const SHOULD_FIX = process.argv.includes('--fix');

const SOURCE_ARTIFACT_EXTENSIONS = [
  '.js',
  '.js.map',
  '.d.ts.map',
  '.d.ts',
] as const;

const DECLARATION_ALLOWLIST = [
  /^apps\/app\/src\/types\/[^/]+\.d\.ts$/u,
  /^apps\/desktop\/app\/src\/shared\/[^/]+\.d\.ts$/u,
  /^apps\/server\/api\/src\/helpers\/test\/[^/]+\.d\.ts$/u,
  /^apps\/server\/api\/src\/types\/[^/]+\.d\.ts$/u,
  /^packages\/api-types\/src\/generated\/[^/]+\.d\.ts$/u,
  /^packages\/ui\/src\/css\.d\.ts$/u,
  /^packages\/workflow-ui\/src\/css\.d\.ts$/u,
];

function git(args: string[]): string {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

function isSourceArtifactPath(filePath: string): boolean {
  const isGeneratedExtension = SOURCE_ARTIFACT_EXTENSIONS.some((extension) =>
    filePath.endsWith(extension),
  );
  if (!isGeneratedExtension) {
    return false;
  }

  if (
    filePath.endsWith('.d.ts') &&
    DECLARATION_ALLOWLIST.some((pattern) => pattern.test(filePath))
  ) {
    return false;
  }

  return (
    /^apps\/app\/app\/.+\.js(?:\.map)?$/u.test(filePath) ||
    /^apps\/app\/packages\/.+\.js(?:\.map)?$/u.test(filePath) ||
    /^apps\/app\/src\/.+\.(?:js|js\.map|d\.ts|d\.ts\.map)$/u.test(filePath) ||
    /^apps\/server\/[^/]+\/src\/.+\.(?:js|js\.map|d\.ts|d\.ts\.map)$/u.test(
      filePath,
    ) ||
    /^packages\/[^/]+\/src\/.+\.(?:js|js\.map|d\.ts|d\.ts\.map)$/u.test(
      filePath,
    ) ||
    /^ee\/packages\/[^/]+\/src\/.+\.(?:js|js\.map|d\.ts|d\.ts\.map)$/u.test(
      filePath,
    )
  );
}

const trackedFiles = git(['ls-files'])
  .split('\n')
  .filter(Boolean)
  .filter(isSourceArtifactPath);

const ignoredFiles = git(['status', '--ignored', '--short'])
  .split('\n')
  .filter((line) => line.startsWith('!! ') || line.startsWith('?? '))
  .map((line) => line.slice(3))
  .filter(isSourceArtifactPath);

const artifacts = [...new Set([...trackedFiles, ...ignoredFiles])].sort();

if (artifacts.length === 0) {
  console.log('No generated source artifacts found.');
  process.exit(0);
}

if (SHOULD_FIX) {
  for (const artifact of artifacts) {
    if (existsSync(artifact)) {
      unlinkSync(artifact);
    }
  }

  console.log(`Removed ${artifacts.length} generated source artifact(s).`);
  process.exit(0);
}

console.error('Generated source artifacts found:');
for (const artifact of artifacts) {
  console.error(`- ${artifact}`);
}
console.error('\nRun `bun run clean:generated-source` to remove them.');
process.exit(1);
