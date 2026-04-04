import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { validatePullRequestBody } from './check-pr-governance.mjs';

function parseArgs(argv) {
  const args = {
    bodyFile: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--body-file' && argv[i + 1]) {
      args.bodyFile = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim();
}

function getChangedFiles() {
  const tracked = runGit(['diff', '--name-only', '--diff-filter=ACMRT', 'HEAD'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const untracked = runGit(['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set([...tracked, ...untracked])];
}

function collectHints(files) {
  const hints = [];
  const hasServer = files.some((file) => file.startsWith('apps/server/'));
  const hasWeb = files.some((file) => file.startsWith('apps/web/'));
  const hasPackages = files.some((file) => file.startsWith('packages/'));
  const hasDocsOnly =
    files.length > 0 &&
    files.every(
      (file) =>
        file.endsWith('.md') ||
        file.startsWith('.github/') ||
        file.startsWith('docs/') ||
        file === 'AGENTS.md',
    );

  hints.push('bun run lint');
  hints.push('bun run type-check');

  if (hasPackages) {
    hints.push('bun run test --filter="./packages/*"');
  }

  if (hasServer) {
    hints.push('bun run test --filter="./apps/server/*"');
  }

  if (hasWeb) {
    hints.push('bun run test --filter="./apps/web/*"');
    hints.push('bun run test:e2e:safe');
  }

  if (hasDocsOnly) {
    hints.length = 0;
    hints.push('bun run check:pr-governance -- --body-file <path-to-pr-body.md>');
    hints.push('Review docs/workflow diffs manually for policy accuracy');
  }

  return [...new Set(hints)];
}

function formatList(title, items) {
  console.log(`\n## ${title}`);
  if (items.length === 0) {
    console.log('- none');
    return;
  }

  for (const item of items) {
    console.log(`- ${item}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const changedFiles = getChangedFiles();

  console.log('# Solo PR Review');

  formatList('Changed Files', changedFiles);

  console.log('\n## Governance Check');
  if (args.bodyFile) {
    if (!existsSync(args.bodyFile)) {
      console.error(`- PR body file not found: ${args.bodyFile}`);
      process.exit(1);
    }

    const body = execFileSync('cat', [args.bodyFile], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const failures = validatePullRequestBody(body);

    if (failures.length === 0) {
      console.log(`- Passed using ${args.bodyFile}`);
    } else {
      console.log(`- Failed using ${args.bodyFile}`);
      for (const failure of failures) {
        console.log(`  - ${failure}`);
      }
    }
  } else if (process.env.GITHUB_EVENT_PATH) {
    console.log(
      '- CI mode detected. Use `bun run check:pr-governance` in CI for authoritative validation.',
    );
  } else {
    console.log(
      '- Skipped. Provide `--body-file <path-to-pr-body.md>` for local PR-body validation.',
    );
  }

  formatList('Suggested Verification Commands', collectHints(changedFiles));

  console.log('\n## Self-Review Template');
  console.log('- Optimization target:');
  console.log('- Alternatives considered:');
  console.log('- Why this fits this repo:');
  console.log('- Evidence actually run:');
  console.log('- Measurement evidence or `Not applicable`:');
  console.log('- Regressions checked: multi-tenancy, serializers, TypeScript strictness, behavior:');
  console.log('- Residual risks / confidence:');
}

main();
