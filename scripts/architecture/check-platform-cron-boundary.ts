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
      kind: 'stale-sweep-allowlist';
      message: string;
    };

export type CronBoundaryResult = {
  detectedCrons: DetectedCron[];
  orphanCronServices: CronBoundaryEntry[];
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
  sweepServiceAllowlist?: CronBoundaryEntry[];
  workersCronServiceGlobs?: string[];
};

export const PLATFORM_CRON_ALLOWLIST: CronBoundaryEntry[] = [
  {
    file: 'apps/server/api/src/collections/referrals/services/referrals.service.ts',
    id: 'referral-reward-settlement',
    methodName: 'settleDueRewards',
    reason:
      'Platform billing-ledger maintenance for durable, idempotent referral reward settlement. The schedule is not tenant-configurable and must recover pending Postgres state after API restarts.',
  },
  {
    file: 'apps/server/workers/src/processors/api/queues/notification-delivery/notification-delivery-recovery.service.ts',
    id: 'notification-delivery-recovery',
    methodName: 'recover',
    reason:
      'Platform recovery for durable notification deliveries after Redis outages, worker crashes, or expired delivery leases.',
  },
  {
    file: 'apps/server/api/src/services/video-completion/video-completion.service.ts',
    id: 'editor-render-reconciliation',
    methodName: 'reconcileEditorRenders',
    reason:
      'Platform recovery for durable editor render completion after missed Redis pub/sub events or API restarts.',
  },
  {
    file: 'apps/server/api/src/services/video-completion/video-completion.service.ts',
    id: 'raw-cut-clip-reconciliation',
    methodName: 'reconcileRawCutClips',
    reason:
      'Platform recovery for deterministic raw-cut clip jobs after missed Redis pub/sub events or API restarts.',
  },
  {
    file: 'apps/server/files/src/cron/temp-file-cleanup.cron.ts',
    id: 'temp-file-cleanup',
    methodName: 'cleanupTempFiles',
    reason: 'Platform temporary file cleanup.',
  },
  {
    file: 'apps/server/workers/src/monitoring/queue-metrics.service.ts',
    id: 'queue-operational-metrics',
    methodName: 'publishQueueMetrics',
    reason:
      'Platform operational telemetry and threshold alerts for BullMQ health. CloudWatch stays fixed-cardinality; per-queue snapshots contain metadata only and never tenant-configurable values.',
  },
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
];

/**
 * Decorator-less services under workers/crons that SystemSweepsProcessor
 * (BullMQ job schedulers, #1092) still invokes. They must NOT regain @Cron.
 */
export const SYSTEM_SWEEP_CRON_SERVICE_ALLOWLIST: CronBoundaryEntry[] = [
  {
    file: 'apps/server/workers/src/crons/batch-generation/cron.batch-generation-reconcile.service.ts',
    id: 'batch-generation-reconcile-sweep',
    methodName: 'reconcileSettlementShortfalls',
    reason:
      'System sweep invoked by SystemSweepsProcessor; decorator removed in #1092.',
  },
  {
    file: 'apps/server/workers/src/crons/engagement/cron.engagement-triggers.service.ts',
    id: 'engagement-triggers-sweep',
    methodName: 'processArmedRules',
    reason:
      'System sweep discovery adapter invoked by SystemSweepsProcessor; every tenant rule runs through engagement-rule-evaluation.',
  },
  {
    file: 'apps/server/workers/src/crons/posts/cron.posts.service.ts',
    id: 'scheduled-posts-sweep',
    methodName: 'publishScheduledPosts',
    reason:
      'System sweep invoked by SystemSweepsProcessor; decorator removed in #1092.',
  },
  {
    file: 'apps/server/workers/src/crons/rss/cron.rss-autopost.service.ts',
    id: 'rss-autopost-sweep',
    methodName: 'pollEnabledSources',
    reason:
      'System sweep discovery adapter invoked by SystemSweepsProcessor; every tenant source runs through rss-source-poll.',
  },
  {
    file: 'apps/server/workers/src/crons/review-gate/cron.review-gate-timeout.service.ts',
    id: 'review-gate-timeout-sweep',
    methodName: 'resolveTimedOutReviewGates',
    reason:
      'System sweep invoked by SystemSweepsProcessor; decorator removed in #1092.',
  },
  {
    file: 'apps/server/workers/src/crons/streaks/cron.streaks.service.ts',
    id: 'streaks-sweep',
    methodName: 'processStreaks',
    reason:
      'System sweep invoked by SystemSweepsProcessor; decorator removed in #1092.',
  },
  {
    file: 'apps/server/workers/src/crons/tiktok/cron.tiktok-status.service.ts',
    id: 'tiktok-status-sweep',
    methodName: 'checkPendingTiktokPosts',
    reason:
      'System sweep invoked by SystemSweepsProcessor; decorator removed in #1092.',
  },
  {
    file: 'apps/server/workers/src/crons/transcript-purge/cron.transcript-purge.service.ts',
    id: 'transcript-purge-sweep',
    methodName: 'purgeExpiredTranscripts',
    reason:
      'System sweep invoked by SystemSweepsProcessor; #3030 daily wipe of soft-deleted agent transcripts.',
  },
  {
    file: 'apps/server/workers/src/crons/youtube/cron.youtube-status.service.ts',
    id: 'youtube-status-sweep',
    methodName: 'checkScheduledYoutubeVideos',
    reason:
      'System sweep invoked by SystemSweepsProcessor; decorator removed in #1092.',
  },
  {
    file: 'apps/server/workers/src/crons/workflow-artifacts/cron.workflow-artifacts.service.ts',
    id: 'workflow-artifacts-cleanup-sweep',
    methodName: 'queueExpiredArtifactCleanup',
    reason:
      'System sweep invoked by SystemSweepsProcessor; enqueues expired workflow-artifact cleanup for every tenant scope past its retention backstop.',
  },
  {
    file: 'apps/server/workers/src/crons/youtube/cron.youtube-messages.service.ts',
    id: 'youtube-messages-sweep',
    methodName: 'syncYoutubeMessages',
    reason:
      'System sweep adapter; each connected credential fans out to the existing YouTube comment-sync workflow.',
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

function detectOrphanCronServices(
  rootDir: string,
  workersCronServiceGlobs: string[],
  ignoreGlobs: string[],
  sweepServiceAllowlist: CronBoundaryEntry[],
  violations: CronBoundaryViolation[],
): CronBoundaryEntry[] {
  const allowlistedFiles = new Set(
    sweepServiceAllowlist.map((entry) => normalizePath(entry.file)),
  );
  const orphanCronServices: CronBoundaryEntry[] = [];
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
      const entry = sweepServiceAllowlist.find(
        (candidate) => normalizePath(candidate.file) === relativeFile,
      );

      if (entry) {
        orphanCronServices.push(entry);
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
        'Decorator-less workers/crons service is not allowlisted. Delete dead leftovers, or add a SystemSweeps allowlist entry if BullMQ still invokes it.',
    });
  }

  for (const entry of sweepServiceAllowlist) {
    const absolutePath = path.join(rootDir, entry.file);

    try {
      readFileSync(absolutePath);
    } catch {
      violations.push({
        entry,
        kind: 'stale-sweep-allowlist',
        message:
          'System sweep allowlist entry no longer matches a workers/crons service file. Remove or update this entry.',
      });
    }
  }

  return orphanCronServices;
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
  const sweepServiceAllowlist =
    options.sweepServiceAllowlist ?? SYSTEM_SWEEP_CRON_SERVICE_ALLOWLIST;
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

  const orphanCronServices = detectOrphanCronServices(
    rootDir,
    workersCronServiceGlobs,
    ignoreGlobs,
    sweepServiceAllowlist,
    violations,
  );

  return {
    detectedCrons,
    orphanCronServices,
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
        violation.kind === 'stale-sweep-allowlist'
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
    `Platform cron boundary passed. ${result.platformCrons.length} platform cron(s), ${result.pendingMigrationCrons.length} tracked migration cron(s), ${result.orphanCronServices.length} system-sweep service(s).`,
  );
}
