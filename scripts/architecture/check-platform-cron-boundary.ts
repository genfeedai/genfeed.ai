import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const DEFAULT_INCLUDE_GLOBS = ['apps/server/**/*.ts'];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/__fixtures__/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/fixtures/**',
  '**/generated/**',
];

export type CronBoundaryEntry = {
  file: string;
  id: string;
  methodName: string;
  reason: string;
};

export type PendingCronMigrationEntry = CronBoundaryEntry & {
  issue: number;
};

export type DetectedCron = {
  className: string | null;
  file: string;
  line: number;
  methodName: string;
};

type EntryKind = 'pending-migration' | 'platform';

type IndexedEntry = {
  entry: CronBoundaryEntry | PendingCronMigrationEntry;
  kind: EntryKind;
};

export type CronBoundaryViolation =
  | {
      cron: DetectedCron;
      kind: 'untracked-cron';
      message: string;
    }
  | {
      entries: IndexedEntry[];
      key: string;
      kind: 'duplicate-entry';
      message: string;
    }
  | {
      crons: DetectedCron[];
      key: string;
      kind: 'duplicate-cron';
      message: string;
    }
  | {
      entry: CronBoundaryEntry | PendingCronMigrationEntry;
      kind: 'stale-entry';
      message: string;
    };

export type CronBoundaryResult = {
  detectedCrons: DetectedCron[];
  pendingMigrationCrons: Array<{
    cron: DetectedCron;
    entry: PendingCronMigrationEntry;
  }>;
  platformCrons: Array<{
    cron: DetectedCron;
    entry: CronBoundaryEntry;
  }>;
  violations: CronBoundaryViolation[];
};

export type CronBoundaryOptions = {
  includeGlobs?: string[];
  ignoreGlobs?: string[];
  pendingMigrations?: PendingCronMigrationEntry[];
  platformAllowlist?: CronBoundaryEntry[];
  rootDir?: string;
};

export const PLATFORM_CRON_ALLOWLIST: CronBoundaryEntry[] = [
  {
    file: 'apps/server/api/src/collections/workflows/services/workflow-scheduler.service.ts',
    id: 'workflow-scheduler-reconciler',
    methodName: 'syncScheduledWorkflows',
    reason: 'Platform workflow scheduler reconciliation.',
  },
  {
    file: 'apps/server/api/src/collections/trends/services/trends-warmup.service.ts',
    id: 'trends-warmup',
    methodName: 'warmGlobalTrendDatasets',
    reason: 'Platform global trend corpus warmup.',
  },
  {
    file: 'apps/server/files/src/cron/temp-file-cleanup.cron.ts',
    id: 'temp-file-cleanup',
    methodName: 'cleanupTempFiles',
    reason: 'Platform temporary file cleanup.',
  },
  {
    file: 'apps/server/workers/src/crons/credentials/cron.credentials.service.ts',
    id: 'credentials-refresh',
    methodName: 'refreshExpiringTokens',
    reason: 'Platform credential refresh maintenance.',
  },
  {
    file: 'apps/server/workers/src/crons/byok-billing/cron.byok-billing.service.ts',
    id: 'byok-billing',
    methodName: 'processMonthlyByokBilling',
    reason: 'Platform BYOK billing maintenance.',
  },
  {
    file: 'apps/server/workers/src/crons/model-deprecation/cron.model-deprecation.service.ts',
    id: 'model-deprecation',
    methodName: 'deprecateSupersededModels',
    reason: 'Platform model lifecycle maintenance.',
  },
  {
    file: 'apps/server/workers/src/crons/model-watcher/cron.model-watcher.service.ts',
    id: 'model-watcher',
    methodName: 'discoverNewModels',
    reason: 'Platform model catalog maintenance.',
  },
  {
    file: 'apps/server/workers/src/crons/tiktok/cron.tiktok-status.service.ts',
    id: 'tiktok-status',
    methodName: 'checkPendingTiktokPosts',
    reason: 'Platform publish-status reconciliation.',
  },
  {
    file: 'apps/server/workers/src/crons/youtube/cron.youtube-status.service.ts',
    id: 'youtube-status',
    methodName: 'checkScheduledYoutubeVideos',
    reason: 'Platform publish-status reconciliation.',
  },
  {
    file: 'apps/server/workers/src/crons/streaks/cron.streaks.service.ts',
    id: 'streaks',
    methodName: 'processStreaks',
    reason: 'Platform streak state maintenance.',
  },
  {
    file: 'apps/server/workers/src/crons/llm-idle/cron.llm-idle.service.ts',
    id: 'llm-idle-stop',
    methodName: 'shutdownIfIdle',
    reason: 'Platform GPU cost-control maintenance.',
  },
  {
    file: 'apps/server/workers/src/crons/ingredients/cron.ingredients.service.ts',
    id: 'ingredients-timeout-health',
    methodName: 'checkStuckProcessingIngredients',
    reason: 'Platform ingredients health check.',
  },
  {
    file: 'apps/server/workers/src/crons/ingredients/cron.ingredients.service.ts',
    id: 'ingredients-metadata-health',
    methodName: 'refreshMissingMetadataDimensions',
    reason: 'Platform ingredients metadata health check.',
  },
  {
    file: 'apps/server/workers/src/crons/pattern-extraction/cron.pattern-extraction.service.ts',
    id: 'pattern-extraction',
    methodName: 'computeDailyPatterns',
    reason: 'Platform pattern extraction maintenance.',
  },
  {
    file: 'apps/server/workers/src/crons/posts/cron.posts.service.ts',
    id: 'posts-publish',
    methodName: 'publishScheduledPosts',
    reason: 'Core publishing scheduler.',
  },
  {
    file: 'apps/server/workers/src/crons/dynamic-jobs/cron.dynamic-jobs.service.ts',
    id: 'dynamic-jobs-dispatcher',
    methodName: 'processDueDynamicJobs',
    reason: 'Platform dynamic job dispatcher.',
  },
  {
    file: 'apps/server/workers/src/crons/workflows/cron.workflows.service.ts',
    id: 'legacy-step-workflow-executor',
    methodName: 'checkScheduledWorkflows',
    reason: 'Legacy step-workflow executor retained during workflow migration.',
  },
  {
    file: 'apps/server/workers/src/crons/trends/cron.trends.service.ts',
    id: 'trends-global-refresh',
    methodName: 'refreshGlobalTrends',
    reason: 'Platform global trends corpus refresh.',
  },
  {
    file: 'apps/server/workers/src/crons/trends/cron.trends.service.ts',
    id: 'trends-corpus-backfill',
    methodName: 'backfillGlobalTrendCorpus',
    reason: 'Platform global trends corpus backfill.',
  },
  {
    file: 'apps/server/workers/src/crons/ad-insights/cron.ad-insights.service.ts',
    id: 'ad-insights-platform-aggregation',
    methodName: 'computeWeeklyInsights',
    reason:
      'Platform weekly ad insights aggregation with public-scope k-anonymity; classified in #796.',
  },
];

export const PENDING_TENANT_CRON_MIGRATIONS: PendingCronMigrationEntry[] = [];

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function entryKey(
  entry: Pick<CronBoundaryEntry, 'file' | 'methodName'>,
): string {
  return `${normalizePath(entry.file)}#${entry.methodName}`;
}

function cronKey(cron: Pick<DetectedCron, 'file' | 'methodName'>): string {
  return `${normalizePath(cron.file)}#${cron.methodName}`;
}

function addIndexedEntry(
  indexedEntries: Map<string, IndexedEntry>,
  violations: CronBoundaryViolation[],
  indexedEntry: IndexedEntry,
): void {
  const key = entryKey(indexedEntry.entry);
  const existingEntry = indexedEntries.get(key);

  if (existingEntry) {
    violations.push({
      entries: [existingEntry, indexedEntry],
      key,
      kind: 'duplicate-entry',
      message:
        'Cron boundary manifest contains duplicate file/method entries. Each static @Cron must have exactly one classification.',
    });
    return;
  }

  indexedEntries.set(key, indexedEntry);
}

function collectScheduleImports(sourceFile: ts.SourceFile): {
  cronIdentifiers: Set<string>;
  scheduleNamespaces: Set<string>;
} {
  const cronIdentifiers = new Set<string>();
  const scheduleNamespaces = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@nestjs/schedule' ||
      !statement.importClause?.namedBindings
    ) {
      continue;
    }

    const { namedBindings } = statement.importClause;

    if (ts.isNamespaceImport(namedBindings)) {
      scheduleNamespaces.add(namedBindings.name.text);
      continue;
    }

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === 'Cron') {
        cronIdentifiers.add(element.name.text);
      }
    }
  }

  return { cronIdentifiers, scheduleNamespaces };
}

function isCronDecorator(
  decorator: ts.Decorator,
  cronIdentifiers: Set<string>,
  scheduleNamespaces: Set<string>,
): boolean {
  const { expression } = decorator;

  if (!ts.isCallExpression(expression)) {
    return false;
  }

  const callee = expression.expression;

  if (ts.isIdentifier(callee)) {
    return cronIdentifiers.has(callee.text);
  }

  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'Cron' &&
    ts.isIdentifier(callee.expression) &&
    scheduleNamespaces.has(callee.expression.text)
  );
}

function methodNameFromNode(node: ts.MethodDeclaration): string {
  if (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name)) {
    return node.name.text;
  }

  return node.name.getText();
}

function classNameFromNode(node: ts.MethodDeclaration): string | null {
  const parent = node.parent;

  if (ts.isClassDeclaration(parent) && parent.name) {
    return parent.name.text;
  }

  return null;
}

function detectCronDecorators(
  filePath: string,
  rootDir: string,
): DetectedCron[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const { cronIdentifiers, scheduleNamespaces } =
    collectScheduleImports(sourceFile);

  if (cronIdentifiers.size === 0 && scheduleNamespaces.size === 0) {
    return [];
  }

  const detected: DetectedCron[] = [];

  function visit(node: ts.Node): void {
    if (ts.isMethodDeclaration(node)) {
      const decorators = ts.canHaveDecorators(node)
        ? (ts.getDecorators(node) ?? [])
        : [];

      for (const decorator of decorators) {
        if (!isCronDecorator(decorator, cronIdentifiers, scheduleNamespaces)) {
          continue;
        }

        detected.push({
          className: classNameFromNode(node),
          file: normalizePath(path.relative(rootDir, filePath)),
          line:
            sourceFile.getLineAndCharacterOfPosition(
              decorator.getStart(sourceFile),
            ).line + 1,
          methodName: methodNameFromNode(node),
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return detected;
}

export function runCheckPlatformCronBoundary(
  options: CronBoundaryOptions = {},
): CronBoundaryResult {
  const rootDir = options.rootDir ?? process.cwd();
  const includeGlobs = options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS;
  const ignoreGlobs = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;
  const platformAllowlist =
    options.platformAllowlist ?? PLATFORM_CRON_ALLOWLIST;
  const pendingMigrations =
    options.pendingMigrations ?? PENDING_TENANT_CRON_MIGRATIONS;

  const indexedEntries = new Map<string, IndexedEntry>();
  const violations: CronBoundaryViolation[] = [];

  for (const entry of platformAllowlist) {
    addIndexedEntry(indexedEntries, violations, {
      entry,
      kind: 'platform',
    });
  }

  for (const entry of pendingMigrations) {
    addIndexedEntry(indexedEntries, violations, {
      entry,
      kind: 'pending-migration',
    });
  }

  const files = globSync(includeGlobs, {
    absolute: true,
    cwd: rootDir,
    ignore: ignoreGlobs,
    nodir: true,
  }).sort();

  const detectedCrons = files.flatMap((filePath) =>
    detectCronDecorators(filePath, rootDir),
  );
  const detectedCronEntries = new Map<string, DetectedCron[]>();

  for (const cron of detectedCrons) {
    const key = cronKey(cron);
    const duplicateCrons = detectedCronEntries.get(key);

    if (duplicateCrons) {
      duplicateCrons.push(cron);
      continue;
    }

    detectedCronEntries.set(key, [cron]);
  }

  for (const [key, crons] of detectedCronEntries) {
    if (crons.length <= 1) {
      continue;
    }

    violations.push({
      crons,
      key,
      kind: 'duplicate-cron',
      message:
        'Multiple detected @Cron decorators resolve to the same file/method key. Rename the method or extend the manifest key before classifying it.',
    });
  }

  const detectedKeys = new Set(detectedCronEntries.keys());
  const platformCrons: CronBoundaryResult['platformCrons'] = [];
  const pendingMigrationCrons: CronBoundaryResult['pendingMigrationCrons'] = [];

  for (const cron of detectedCrons) {
    const indexedEntry = indexedEntries.get(cronKey(cron));

    if (!indexedEntry) {
      violations.push({
        cron,
        kind: 'untracked-cron',
        message:
          'Static @Cron is not classified. Tenant-product recurring automation must be workflow-backed; platform maintenance cron must be explicitly allowlisted.',
      });
      continue;
    }

    if (indexedEntry.kind === 'platform') {
      platformCrons.push({
        cron,
        entry: indexedEntry.entry,
      });
      continue;
    }

    pendingMigrationCrons.push({
      cron,
      entry: indexedEntry.entry as PendingCronMigrationEntry,
    });
  }

  for (const indexedEntry of indexedEntries.values()) {
    if (!detectedKeys.has(entryKey(indexedEntry.entry))) {
      violations.push({
        entry: indexedEntry.entry,
        kind: 'stale-entry',
        message:
          'Cron boundary manifest entry no longer matches a detected @Cron decorator. Remove or update this entry.',
      });
    }
  }

  return {
    detectedCrons,
    pendingMigrationCrons,
    platformCrons,
    violations,
  };
}

function formatCron(cron: DetectedCron): string {
  const owner = cron.className
    ? `${cron.className}.${cron.methodName}`
    : cron.methodName;

  return `${cron.file}:${cron.line} ${owner}`;
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckPlatformCronBoundary();

  if (result.violations.length > 0) {
    console.error('Platform cron boundary violations found.');

    for (const violation of result.violations) {
      if (violation.kind === 'untracked-cron') {
        console.error(`- ${formatCron(violation.cron)}: ${violation.message}`);
        continue;
      }

      if (violation.kind === 'stale-entry') {
        console.error(
          `- ${violation.entry.file}#${violation.entry.methodName}: ${violation.message}`,
        );
        continue;
      }

      if (violation.kind === 'duplicate-entry') {
        console.error(`- ${violation.key}: ${violation.message}`);
        for (const duplicate of violation.entries) {
          console.error(
            `  - ${duplicate.kind} ${duplicate.entry.id}: ${duplicate.entry.reason}`,
          );
        }
        continue;
      }

      console.error(`- ${violation.key}: ${violation.message}`);
      for (const cron of violation.crons) {
        console.error(`  - ${formatCron(cron)}`);
      }
    }

    console.error(
      '\nUse workflows for tenant recurring automation, or add a reviewed platform-maintenance allowlist entry with a reason.',
    );
    process.exit(1);
  }

  if (result.pendingMigrationCrons.length > 0) {
    console.log(
      `Platform cron boundary passed with ${result.pendingMigrationCrons.length} tracked tenant cron migration(s) still open:`,
    );

    for (const pending of result.pendingMigrationCrons) {
      console.log(
        `- ${formatCron(pending.cron)} -> #${pending.entry.issue} ${pending.entry.reason}`,
      );
    }
  }

  console.log(
    `Platform cron boundary passed. ${result.platformCrons.length} platform cron(s), ${result.pendingMigrationCrons.length} tracked migration cron(s).`,
  );
}
