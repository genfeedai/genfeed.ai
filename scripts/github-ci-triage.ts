#!/usr/bin/env bun

import { $ } from 'bun';

interface CliArgs {
  pr?: string;
  repo: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { repo: 'genfeedai/cloud' };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pr' && argv[i + 1]) {
      args.pr = argv[i + 1];
      i += 1;
      continue;
    }

    if (argv[i] === '--repo' && argv[i + 1]) {
      args.repo = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function classifyFailure(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('type') || lower.includes('ts')) return 'type-check';
  if (
    lower.includes('lint') ||
    lower.includes('biome') ||
    lower.includes('eslint')
  ) {
    return 'lint';
  }
  if (
    lower.includes('test') ||
    lower.includes('vitest') ||
    lower.includes('jest')
  ) {
    return 'test';
  }
  if (
    lower.includes('build') ||
    lower.includes('module') ||
    lower.includes('import')
  ) {
    return 'build';
  }
  return 'unknown';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pr) {
    throw new Error(
      'Usage: bun run scripts/github-ci-triage.ts --pr <number> [--repo owner/name]',
    );
  }

  const prJson =
    await $`gh pr view ${args.pr} --repo ${args.repo} --json number,title,reviews,comments,statusCheckRollup,url`.text();
  const pr = JSON.parse(prJson) as {
    number: number;
    title: string;
    url: string;
    comments?: Array<{ body?: string; url?: string }>;
    reviews?: Array<{
      body?: string;
      author?: { login?: string };
      state?: string;
    }>;
    statusCheckRollup?: Array<{
      __typename?: string;
      conclusion?: string;
      name?: string;
      detailsUrl?: string;
    }>;
  };

  const failingChecks = (pr.statusCheckRollup ?? []).filter(
    (check) =>
      check.conclusion &&
      check.conclusion !== 'SUCCESS' &&
      check.conclusion !== 'SKIPPED',
  );

  const grouped = new Map<
    string,
    Array<{ name?: string; detailsUrl?: string }>
  >();
  for (const check of failingChecks) {
    const kind = classifyFailure(check.name ?? '');
    const bucket = grouped.get(kind) ?? [];
    bucket.push({ detailsUrl: check.detailsUrl, name: check.name });
    grouped.set(kind, bucket);
  }

  console.log(`# PR #${pr.number}: ${pr.title}`);
  console.log(pr.url);
  console.log('\n## Failing Checks');

  if (failingChecks.length === 0) {
    console.log('- none');
  } else {
    for (const [kind, checks] of grouped.entries()) {
      console.log(`- ${kind}`);
      for (const check of checks) {
        console.log(
          `  - ${check.name ?? 'unknown'} ${check.detailsUrl ?? ''}`.trimEnd(),
        );
      }
    }
  }

  console.log('\n## Review Signals');
  for (const review of pr.reviews ?? []) {
    console.log(
      `- review (${review.state ?? 'UNKNOWN'}) by ${review.author?.login ?? 'unknown'}: ${(review.body ?? '').split('\n')[0]}`,
    );
  }
  for (const comment of pr.comments ?? []) {
    console.log(`- general: ${(comment.body ?? '').split('\n')[0]}`);
  }

  console.log('\n## Proposed Fix Order');
  const order = ['test', 'type-check', 'lint', 'build', 'unknown'];
  for (const kind of order) {
    if (grouped.has(kind)) {
      console.log(`- ${kind}`);
    }
  }
}

await main();
