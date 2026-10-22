import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  API_E2E_TIER_MANIFEST,
  type ApiE2eExclusion,
  type ApiE2eTierManifest,
} from './api-e2e-tiers.manifest';

const API_ROOT = path.resolve(import.meta.dirname, '..');
const DISCOVERY_ROOTS = ['test/e2e', 'test/integration'];
const REPORT_DIRECTORY = 'test-results/api-e2e';
const VITEST_CONFIG = 'vitest.config.e2e.ts';

export type ApiE2eTier =
  | 'core'
  | 'full'
  | 'isolated-publish'
  | 'context-embedding';

export type ApiE2eTierPlan = {
  discoveredFiles: string[];
  excludedFiles: ApiE2eExclusion[];
  selectedFiles: string[];
  tier: ApiE2eTier;
};

type ApiE2eRunReport = {
  discoveredFileCount: number;
  excludedFileCount: number;
  excludedFiles: ApiE2eExclusion[];
  executedFileCount: number;
  failedFileCount: number | null;
  selectedFileCount: number;
  selectedFiles: string[];
  status: 'failed' | 'passed';
  tier: ApiE2eTier;
  vitestExitCode: number;
};

type VitestJsonReport = {
  numFailedTestSuites?: number;
  testResults?: Array<{
    name?: string;
    status?: string;
    assertionResults?: Array<{ status?: string }>;
  }>;
};

type CliOptions = {
  listOnly: boolean;
  tier: ApiE2eTier;
  vitestArgs: string[];
};

function toPosixPath(file: string): string {
  return file.replaceAll(path.sep, '/');
}

function collectSpecFiles(rootDir: string, directory: string): string[] {
  const absoluteDirectory = path.join(rootDir, directory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(
    (entry) => {
      const relativePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSpecFiles(rootDir, relativePath);
      }

      return entry.isFile() && entry.name.endsWith('spec.ts')
        ? [toPosixPath(relativePath)]
        : [];
    },
  );
}

export function discoverApiE2eSpecs(rootDir = API_ROOT): string[] {
  return DISCOVERY_ROOTS.flatMap((directory) =>
    collectSpecFiles(rootDir, directory),
  ).sort((left, right) => left.localeCompare(right));
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates].sort((left, right) => left.localeCompare(right));
}

export function validateApiE2eTierManifest(
  discoveredFiles: string[],
  manifest: ApiE2eTierManifest = API_E2E_TIER_MANIFEST,
  tier: ApiE2eTier = 'full',
): string[] {
  const discovered = new Set(discoveredFiles);
  const coreDuplicates = duplicateValues(manifest.coreFiles);
  const excludedPaths = manifest.exclusions.map(({ file }) => file);
  const exclusionDuplicates = duplicateValues(excludedPaths);
  const isolatedPublishFiles = manifest.isolatedPublishFiles ?? [];
  const isolatedDuplicates = duplicateValues(isolatedPublishFiles);
  const embeddingFiles = manifest.contextEmbeddingFiles ?? [];
  const errors: string[] = [];
  if (duplicateValues(embeddingFiles).length)
    errors.push('Duplicate context-embedding files');
  if (tier === 'context-embedding' && embeddingFiles.length !== 2)
    errors.push('Context-embedding requires exactly two acceptance files');
  for (const file of embeddingFiles) {
    if (!discovered.has(file))
      errors.push('Context-embedding file is not discoverable: ' + file);
    if (
      manifest.coreFiles.includes(file) ||
      isolatedPublishFiles.includes(file) ||
      excludedPaths.includes(file)
    )
      errors.push(
        'Context-embedding file cannot belong to another lane: ' + file,
      );
  }

  if (coreDuplicates.length > 0) {
    errors.push(`Duplicate core files: ${coreDuplicates.join(', ')}`);
  }
  if (isolatedDuplicates.length > 0) {
    errors.push(
      `Duplicate isolated-publish files: ${isolatedDuplicates.join(', ')}`,
    );
  }
  for (const file of manifest.coreFiles) {
    if (!discovered.has(file)) {
      errors.push(`Core file is not discoverable: ${file}`);
    }
  }
  for (const file of isolatedPublishFiles) {
    if (!discovered.has(file)) {
      errors.push(`Isolated-publish file is not discoverable: ${file}`);
    }
    if (manifest.coreFiles.includes(file)) {
      errors.push(`Core file cannot also be isolated-publish: ${file}`);
    }
  }

  if (tier === 'full') {
    if (exclusionDuplicates.length > 0) {
      errors.push(`Duplicate exclusions: ${exclusionDuplicates.join(', ')}`);
    }

    for (const exclusion of manifest.exclusions) {
      if (!discovered.has(exclusion.file)) {
        errors.push(`Excluded file is not discoverable: ${exclusion.file}`);
      }
      if (exclusion.reason.trim().length === 0) {
        errors.push(`Excluded file has no reason: ${exclusion.file}`);
      }
      if (
        !Number.isSafeInteger(exclusion.trackingIssue) ||
        exclusion.trackingIssue <= 0
      ) {
        errors.push(`Excluded file has no tracking issue: ${exclusion.file}`);
      }
      if (manifest.coreFiles.includes(exclusion.file)) {
        errors.push(`Core file cannot also be excluded: ${exclusion.file}`);
      }
      if (isolatedPublishFiles.includes(exclusion.file)) {
        errors.push(
          `Isolated-publish file cannot also be excluded: ${exclusion.file}`,
        );
      }
    }
  }

  return errors;
}

export function buildApiE2eTierPlan(options: {
  manifest?: ApiE2eTierManifest;
  rootDir?: string;
  tier: ApiE2eTier;
}): ApiE2eTierPlan {
  const manifest = options.manifest ?? API_E2E_TIER_MANIFEST;
  const discoveredFiles = discoverApiE2eSpecs(options.rootDir ?? API_ROOT);
  const manifestErrors = validateApiE2eTierManifest(
    discoveredFiles,
    manifest,
    options.tier,
  );

  if (manifestErrors.length > 0) {
    throw new Error(
      `Invalid API E2E tier manifest:\n${manifestErrors
        .map((error) => `- ${error}`)
        .join('\n')}`,
    );
  }

  const excludedPaths = new Set(manifest.exclusions.map(({ file }) => file));
  const isolatedPaths = new Set(manifest.isolatedPublishFiles ?? []);
  const embeddingPaths = new Set(manifest.contextEmbeddingFiles ?? []);
  const selectedFiles =
    options.tier === 'core'
      ? [...manifest.coreFiles]
      : options.tier === 'context-embedding'
        ? [...(manifest.contextEmbeddingFiles ?? [])]
        : options.tier === 'isolated-publish'
          ? [...(manifest.isolatedPublishFiles ?? [])]
          : discoveredFiles.filter(
              (file) =>
                !excludedPaths.has(file) &&
                !isolatedPaths.has(file) &&
                !embeddingPaths.has(file),
            );

  const isolatedExclusions: ApiE2eExclusion[] = [
    ...(manifest.isolatedPublishFiles ?? []),
  ].map((file) => ({
    file,
    reason: 'Owned by the isolated-publish lane; not attached to core or full.',
    trackingIssue: 3836,
  }));

  return {
    discoveredFiles,
    excludedFiles:
      options.tier === 'full'
        ? [
            ...manifest.exclusions,
            ...isolatedExclusions,
            ...(manifest.contextEmbeddingFiles ?? []).map((file) => ({
              file,
              reason:
                'Owned by the dedicated Context Embedding Acceptance lane.',
              trackingIssue: 5149,
            })),
          ]
        : [],
    selectedFiles,
    tier: options.tier,
  };
}

function parseCliOptions(args: string[]): CliOptions {
  const [tierValue, ...rest] = args;
  if (
    tierValue !== 'core' &&
    tierValue !== 'full' &&
    tierValue !== 'isolated-publish' &&
    tierValue !== 'context-embedding'
  ) {
    throw new Error(
      'Usage: bun run scripts/api-e2e-tiers.ts <core|full|isolated-publish|context-embedding> [--list] [vitest args...]',
    );
  }

  return {
    listOnly: rest.includes('--list'),
    tier: tierValue,
    vitestArgs: rest.filter((arg) => arg !== '--list'),
  };
}

function readVitestReport(reportPath: string): VitestJsonReport {
  return JSON.parse(readFileSync(reportPath, 'utf8')) as VitestJsonReport;
}

export function validateContextEmbeddingReport(
  report: VitestJsonReport,
  selectedFiles: string[],
): string[] {
  const errors: string[] = [];
  const results = report.testResults ?? [];
  const normalized = results.map(({ name }) =>
    name ? toPosixPath(path.relative(API_ROOT, name)) : '',
  );
  if (
    results.length !== selectedFiles.length ||
    duplicateValues(normalized).length ||
    selectedFiles.some((file) => !normalized.includes(file)) ||
    normalized.some((file) => !selectedFiles.includes(file))
  )
    errors.push('Acceptance report must contain each exact selected file once');
  for (const result of results) {
    if (
      result.status !== 'passed' ||
      !result.assertionResults?.length ||
      result.assertionResults.some((assertion) => assertion.status !== 'passed')
    )
      errors.push(
        'Every acceptance file needs nonzero passed assertions and zero skipped or pending assertions',
      );
  }
  return errors;
}

function writeRunReport(reportPath: string, report: ApiE2eRunReport): void {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function appendGitHubSummary(report: ApiE2eRunReport): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  const lines = [
    `### API E2E ${report.tier} tier`,
    '',
    '| Discovered | Selected | Executed | Excluded | Failed |',
    '| ---: | ---: | ---: | ---: | ---: |',
    `| ${report.discoveredFileCount} | ${report.selectedFileCount} | ${report.executedFileCount} | ${report.excludedFileCount} | ${report.failedFileCount ?? 'n/a'} |`,
    '',
  ];

  if (report.excludedFiles.length > 0) {
    lines.push(
      'Excluded files:',
      '',
      ...report.excludedFiles.map(
        ({ file, reason, trackingIssue }) =>
          `- \`${file}\` — ${reason} ([#${trackingIssue}](https://github.com/genfeedai/genfeed.ai/issues/${trackingIssue}))`,
      ),
      '',
    );
  }

  writeFileSync(summaryPath, `${lines.join('\n')}\n`, { flag: 'a' });
}

function runApiE2eTier(options: CliOptions): number {
  const plan = buildApiE2eTierPlan({ tier: options.tier });
  const reportDirectory = path.join(API_ROOT, REPORT_DIRECTORY);
  const reportPath = path.join(reportDirectory, `${options.tier}.json`);
  const vitestReportPath = path.join(
    reportDirectory,
    `vitest-${options.tier}.json`,
  );

  console.log(
    `[api-e2e] tier=${plan.tier} discovered=${plan.discoveredFiles.length} selected=${plan.selectedFiles.length} excluded=${plan.excludedFiles.length}`,
  );
  for (const file of plan.selectedFiles) {
    console.log(`[api-e2e] selected ${file}`);
  }
  for (const exclusion of plan.excludedFiles) {
    console.log(
      `[api-e2e] excluded ${exclusion.file} (#${exclusion.trackingIssue}): ${exclusion.reason}`,
    );
  }

  if (options.listOnly) {
    return 0;
  }

  mkdirSync(reportDirectory, { recursive: true });
  rmSync(vitestReportPath, { force: true });
  const result = spawnSync(
    'bunx',
    [
      'vitest',
      'run',
      '--config',
      VITEST_CONFIG,
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${vitestReportPath}`,
      ...plan.selectedFiles,
      ...options.vitestArgs,
    ],
    {
      cwd: API_ROOT,
      env: process.env,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    console.error(result.error.message);
  }
  if (result.signal) {
    console.error(`[api-e2e] terminated by signal ${result.signal}`);
  }

  let vitestExitCode = result.status ?? 1;
  let executedFileCount = 0;
  let failedFileCount: number | null = null;

  if (existsSync(vitestReportPath)) {
    const vitestReport = readVitestReport(vitestReportPath);
    executedFileCount = vitestReport.testResults?.length ?? 0;
    if (options.tier === 'context-embedding') {
      const errors = validateContextEmbeddingReport(
        vitestReport,
        plan.selectedFiles,
      );
      if (errors.length) {
        for (const error of errors) console.error('[api-e2e] ' + error);
        vitestExitCode = 1;
      }
    }
    failedFileCount =
      vitestReport.numFailedTestSuites ??
      vitestReport.testResults?.filter(({ status }) => status === 'failed')
        .length ??
      0;
  } else if (vitestExitCode === 0) {
    console.error(
      '[api-e2e] Vitest exited cleanly without writing its JSON report.',
    );
    vitestExitCode = 1;
  }

  const report: ApiE2eRunReport = {
    discoveredFileCount: plan.discoveredFiles.length,
    excludedFileCount: plan.excludedFiles.length,
    excludedFiles: plan.excludedFiles,
    executedFileCount,
    failedFileCount,
    selectedFileCount: plan.selectedFiles.length,
    selectedFiles: plan.selectedFiles,
    status: vitestExitCode === 0 ? 'passed' : 'failed',
    tier: plan.tier,
    vitestExitCode,
  };

  writeRunReport(reportPath, report);
  appendGitHubSummary(report);
  console.log(
    `[api-e2e] status=${report.status} executed=${executedFileCount} failed=${failedFileCount ?? 'n/a'} report=${toPosixPath(path.relative(API_ROOT, reportPath))}`,
  );

  return vitestExitCode;
}

if (import.meta.main) {
  try {
    process.exit(runApiE2eTier(parseCliOptions(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
