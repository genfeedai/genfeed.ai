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
    }
  | {
      entry: CronBoundaryEntry;
      kind: 'orphan-cron-service';
      message: string;
    }
  | {
      entry: CronBoundaryEntry;
      kind: 'stale-handler-allowlist';
      message: string;
    };

export type CronBoundaryResult = {
  detectedCrons: DetectedCron[];
  platformScheduleHandlerServices: CronBoundaryEntry[];
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
  handlerAllowlist?: CronBoundaryEntry[];
  workersCronServiceGlobs?: string[];
};

/**
 * Every decorator-less handler retained under workers/crons and invoked by
 * PlatformSchedulesProcessor. The boundary scans this inventory so a stale
 * cron-named service cannot survive the hard cut without an explicit task.
 */
export const PLATFORM_SCHEDULE_HANDLER_ALLOWLIST: CronBoundaryEntry[] = [
  {
    file: 'apps/server/workers/src/crons/credentials/cron.credentials.service.ts',
    id: 'credentials-refresh',
    methodName: 'refreshExpiringTokens',
    reason:
      'Platform OAuth token lifecycle maintenance. Not user automation: tenants cannot meaningfully inspect, duplicate, or disable it - disabling breaks their own connected integrations. Re-justified in #1092.',
  },
  {
    file: 'apps/server/workers/src/crons/byok-billing/cron.byok-billing.service.ts',
    id: 'byok-billing',
    methodName: 'processMonthlyByokBilling',
    reason:
      'Platform billing invoicing (Stripe). Must never be tenant-mutable or duplicable, and workflow retry semantics risk double invoicing. Re-justified in #1092.',
  },
  {
    file: 'apps/server/workers/src/crons/model-deprecation/cron.model-deprecation.service.ts',
    id: 'model-deprecation',
    methodName: 'deprecateSupersededModels',
    reason: 'Platform model lifecycle maintenance.',
  },
  {
    file: 'apps/server/workers/src/crons/fal-model-watcher/cron.fal-model-watcher.service.ts',
    id: 'fal-model-watcher',
    methodName: 'discoverNewModels',
    reason:
      'Platform model catalog maintenance (fal provider discovery, #2422). Writes operator-reviewed draft rows only; never tenant-scoped.',
  },
  {
    file: 'apps/server/workers/src/crons/model-watcher/cron.model-watcher.service.ts',
    id: 'model-watcher',
    methodName: 'discoverNewModels',
    reason: 'Platform model catalog maintenance.',
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
    file: 'apps/server/workers/src/crons/trends/cron.trends.service.ts',
    id: 'trends-global-refresh',
    methodName: 'refreshGlobalTrends',
    reason: 'Platform global trends corpus refresh.',
  },
  {
    file: 'apps/server/workers/src/crons/batch-generation/cron.batch-generation-reconcile.service.ts',
    id: 'batch-generation-reconcile',
    methodName: 'reconcileSettlementShortfalls',
    reason: 'Platform schedule handler invoked by PlatformSchedulesProcessor.',
  },
  {
    file: 'apps/server/workers/src/crons/engagement/cron.engagement-triggers.service.ts',
    id: 'engagement-triggers',
    methodName: 'processArmedRules',
    reason:
      'Platform schedule discovery handler; every tenant rule runs through engagement-rule-evaluation.',
  },
  {
    file: 'apps/server/workers/src/crons/posts/cron.posts.service.ts',
    id: 'posts-publish',
    methodName: 'publishScheduledPosts',
    reason: 'Platform schedule handler invoked by PlatformSchedulesProcessor.',
  },
  {
    file: 'apps/server/workers/src/crons/rss/cron.rss-autopost.service.ts',
    id: 'rss-autopost',
    methodName: 'pollEnabledSources',
    reason:
      'Platform schedule discovery handler; every tenant source runs through rss-source-poll.',
  },
  {
    file: 'apps/server/workers/src/crons/review-gate/cron.review-gate-timeout.service.ts',
    id: 'review-gate-timeout',
    methodName: 'resolveTimedOutReviewGates',
    reason: 'Platform schedule handler invoked by PlatformSchedulesProcessor.',
  },
  {
    file: 'apps/server/workers/src/crons/streaks/cron.streaks.service.ts',
    id: 'streak-maintenance',
    methodName: 'processStreaks',
    reason: 'Platform schedule handler invoked by PlatformSchedulesProcessor.',
  },
  {
    file: 'apps/server/workers/src/crons/tiktok/cron.tiktok-status.service.ts',
    id: 'tiktok-status',
    methodName: 'checkPendingTiktokPosts',
    reason: 'Platform schedule handler invoked by PlatformSchedulesProcessor.',
  },
  {
    file: 'apps/server/workers/src/crons/transcript-purge/cron.transcript-purge.service.ts',
    id: 'transcript-purge',
    methodName: 'purgeExpiredTranscripts',
    reason:
      'Platform schedule handler for the #3030 daily wipe of soft-deleted agent transcripts.',
  },
  {
    file: 'apps/server/workers/src/crons/youtube/cron.youtube-status.service.ts',
    id: 'youtube-status',
    methodName: 'checkScheduledYoutubeVideos',
    reason: 'Platform schedule handler invoked by PlatformSchedulesProcessor.',
  },
  {
    file: 'apps/server/workers/src/crons/workflow-artifacts/cron.workflow-artifacts.service.ts',
    id: 'workflow-artifact-cleanup',
    methodName: 'queueExpiredArtifactCleanup',
    reason:
      'Platform schedule handler that enqueues expired workflow-artifact cleanup for every tenant scope past its retention backstop.',
  },
  {
    file: 'apps/server/workers/src/crons/youtube/cron.youtube-messages.service.ts',
    id: 'youtube-messages',
    methodName: 'syncYoutubeMessages',
    reason:
      'Platform schedule handler; each connected credential fans out to the existing YouTube comment-sync workflow.',
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
  scheduleIdentifiers: Set<string>;
  scheduleNamespaces: Set<string>;
} {
  const scheduleIdentifiers = new Set<string>();
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
      if (importedName === 'Cron' || importedName === 'Interval') {
        scheduleIdentifiers.add(element.name.text);
      }
    }
  }

  return { scheduleIdentifiers, scheduleNamespaces };
}

function isScheduleDecorator(
  decorator: ts.Decorator,
  scheduleIdentifiers: Set<string>,
  scheduleNamespaces: Set<string>,
): boolean {
  const { expression } = decorator;

  if (!ts.isCallExpression(expression)) {
    return false;
  }

  const callee = expression.expression;

  if (ts.isIdentifier(callee)) {
    return scheduleIdentifiers.has(callee.text);
  }

  return (
    ts.isPropertyAccessExpression(callee) &&
    (callee.name.text === 'Cron' || callee.name.text === 'Interval') &&
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
  const { scheduleIdentifiers, scheduleNamespaces } =
    collectScheduleImports(sourceFile);

  if (scheduleIdentifiers.size === 0 && scheduleNamespaces.size === 0) {
    return [];
  }

  const detected: DetectedCron[] = [];

  function visit(node: ts.Node): void {
    if (ts.isMethodDeclaration(node)) {
      const decorators = ts.canHaveDecorators(node)
        ? (ts.getDecorators(node) ?? [])
        : [];

      for (const decorator of decorators) {
        if (
          !isScheduleDecorator(
            decorator,
            scheduleIdentifiers,
            scheduleNamespaces,
          )
        ) {
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

function detectPlatformScheduleHandlerServices(
  rootDir: string,
  workersCronServiceGlobs: string[],
  ignoreGlobs: string[],
  handlerAllowlist: CronBoundaryEntry[],
  violations: CronBoundaryViolation[],
): CronBoundaryEntry[] {
  const allowlistedFiles = new Set(
    handlerAllowlist.map((entry) => normalizePath(entry.file)),
  );
  const platformScheduleHandlerServices: CronBoundaryEntry[] = [];
  const files = globSync(workersCronServiceGlobs, {
    absolute: true,
    cwd: rootDir,
    ignore: ignoreGlobs,
    nodir: true,
  }).sort();

  for (const filePath of files) {
    const relativeFile = normalizePath(path.relative(rootDir, filePath));
    const detected = detectCronDecorators(filePath, rootDir);

    if (detected.length > 0) {
      continue;
    }

    if (allowlistedFiles.has(relativeFile)) {
      const entry = handlerAllowlist.find(
        (candidate) => normalizePath(candidate.file) === relativeFile,
      );

      if (entry) {
        platformScheduleHandlerServices.push(entry);
      }
      continue;
    }

    violations.push({
      entry: {
        file: relativeFile,
        id: 'orphan-cron-service',
        methodName: '(decorator-less)',
        reason: 'Decorator-less workers/crons service without allowlist entry.',
      },
      kind: 'orphan-cron-service',
      message:
        'Decorator-less workers/crons service is not registered as a platform schedule handler. Delete dead leftovers or register the handler.',
    });
  }

  for (const entry of handlerAllowlist) {
    const absolutePath = path.join(rootDir, entry.file);

    try {
      readFileSync(absolutePath);
    } catch {
      violations.push({
        entry,
        kind: 'stale-handler-allowlist',
        message:
          'Platform schedule handler entry no longer matches a workers/crons service file. Remove or update this entry.',
      });
    }
  }

  return platformScheduleHandlerServices;
}

export function runCheckPlatformCronBoundary(
  options: CronBoundaryOptions = {},
): CronBoundaryResult {
  const rootDir = options.rootDir ?? process.cwd();
  const includeGlobs = options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS;
  const ignoreGlobs = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;
  const platformAllowlist = options.platformAllowlist ?? [];
  const pendingMigrations =
    options.pendingMigrations ?? PENDING_TENANT_CRON_MIGRATIONS;
  const handlerAllowlist =
    options.handlerAllowlist ?? PLATFORM_SCHEDULE_HANDLER_ALLOWLIST;
  const workersCronServiceGlobs = options.workersCronServiceGlobs ?? [
    'apps/server/workers/src/crons/**/*.service.ts',
  ];

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
        'Multiple detected @Cron/@Interval decorators resolve to the same file/method key. Rename the method or extend the manifest key before classifying it.',
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
          'Static @Cron/@Interval schedule is not classified. Tenant-product recurring automation must be workflow-backed; platform maintenance schedules must be explicitly allowlisted.',
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
          'Cron boundary manifest entry no longer matches a detected @Cron/@Interval decorator. Remove or update this entry.',
      });
    }
  }

  const platformScheduleHandlerServices = detectPlatformScheduleHandlerServices(
    rootDir,
    workersCronServiceGlobs,
    ignoreGlobs,
    handlerAllowlist,
    violations,
  );

  return {
    detectedCrons,
    platformScheduleHandlerServices,
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

      if (
        violation.kind === 'stale-entry' ||
        violation.kind === 'orphan-cron-service' ||
        violation.kind === 'stale-handler-allowlist'
      ) {
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
      '\nNest timers are retired. Use a database-backed Workflow schedule or the typed BullMQ platform schedule catalog.',
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
    'Scheduler boundary passed. No process-local Nest timers detected.',
  );
}
