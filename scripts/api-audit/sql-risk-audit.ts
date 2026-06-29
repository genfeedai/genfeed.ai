import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { globSync } from 'glob';
import ts from 'typescript';

const DEFAULT_SOURCE_GLOBS = ['apps/server/api/src/**/*.ts'];
const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/node_modules/**',
  '**/dist/**',
  '**/generated/**',
];

const PRISMA_METHODS = new Set([
  '$executeRaw',
  '$executeRawUnsafe',
  '$queryRaw',
  '$queryRawUnsafe',
  '$transaction',
  'aggregate',
  'count',
  'deleteMany',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
  'updateMany',
  'upsert',
]);

export type SqlRiskSeverity = 'high' | 'medium' | 'low';

export interface SqlRiskFinding {
  category: string;
  file: string;
  line: number;
  method: string;
  recommendation: string;
  receiver: string;
  severity: SqlRiskSeverity;
  snippet: string;
}

export interface SqlRiskAuditResult {
  filesScanned: number;
  findings: SqlRiskFinding[];
  generatedAt: string;
  operationCounts: Record<string, number>;
  rootDir: string;
  summary: {
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    findings: number;
    high: number;
    low: number;
    medium: number;
  };
}

export interface SqlRiskAuditOptions {
  rootDir?: string;
  sourceGlobs?: string[];
}

interface CliOptions extends SqlRiskAuditOptions {
  failOnHigh: boolean;
  isJsonOutput: boolean;
  out?: string;
}

interface PrismaCall {
  callText: string;
  file: string;
  leadingText: string;
  line: number;
  method: string;
  receiver: string;
}

export function runSqlRiskAudit(
  options: SqlRiskAuditOptions = {},
): SqlRiskAuditResult {
  const rootDir = options.rootDir ?? process.cwd();
  const files = findSourceFiles(rootDir, options.sourceGlobs);
  const calls = files.flatMap((file) => scanSourceFile(rootDir, file));
  const findings = calls.flatMap(createFindingsForCall);
  const operationCounts = countBy(calls, (call) => call.method);

  findings.sort((left, right) => {
    return (
      severityRank(right.severity) - severityRank(left.severity) ||
      left.file.localeCompare(right.file) ||
      left.line - right.line
    );
  });

  const bySeverity = countBy(findings, (finding) => finding.severity);
  return {
    filesScanned: files.length,
    findings,
    generatedAt: new Date().toISOString(),
    operationCounts,
    rootDir,
    summary: {
      byCategory: countBy(findings, (finding) => finding.category),
      bySeverity,
      findings: findings.length,
      high: bySeverity.high ?? 0,
      low: bySeverity.low ?? 0,
      medium: bySeverity.medium ?? 0,
    },
  };
}

export function formatSqlRiskAudit(result: SqlRiskAuditResult): string {
  const lines = [
    '# API SQL Risk Audit',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    `Files scanned: ${result.filesScanned}`,
    `Findings: ${result.summary.findings}`,
    `High: ${result.summary.high}`,
    `Medium: ${result.summary.medium}`,
    `Low: ${result.summary.low}`,
    '',
    '## By Category',
    '',
    ...formatCountLines(result.summary.byCategory),
    '',
    '## Prisma Operation Counts',
    '',
    ...formatCountLines(result.operationCounts),
    '',
    '## Findings',
    '',
    '| Severity | Category | File | Line | Method | Receiver | Recommendation |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const finding of result.findings) {
    lines.push(
      [
        finding.severity,
        finding.category,
        finding.file,
        String(finding.line),
        finding.method,
        finding.receiver,
        finding.recommendation,
      ]
        .map(escapeMarkdownCell)
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    );
  }

  lines.push('');
  return lines.join('\n');
}

function findSourceFiles(rootDir: string, sourceGlobs?: string[]): string[] {
  return (sourceGlobs ?? DEFAULT_SOURCE_GLOBS).flatMap((sourceGlob) => {
    return globSync(sourceGlob, {
      absolute: true,
      cwd: rootDir,
      ignore: DEFAULT_IGNORE_GLOBS,
      nodir: true,
    });
  });
}

function scanSourceFile(rootDir: string, absoluteFile: string): PrismaCall[] {
  const sourceText = readFileSync(absoluteFile, 'utf8');
  const source = ts.createSourceFile(
    absoluteFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const calls: PrismaCall[] = [];
  const relativeFile = path.relative(rootDir, absoluteFile);

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const call = readPrismaCall(source, relativeFile, node);
      if (call) {
        calls.push(call);
      }
    } else if (ts.isTaggedTemplateExpression(node)) {
      const call = readPrismaTaggedTemplate(source, relativeFile, node);
      if (call) {
        calls.push(call);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return calls;
}

function readPrismaCall(
  source: ts.SourceFile,
  relativeFile: string,
  call: ts.CallExpression,
): PrismaCall | undefined {
  if (!ts.isPropertyAccessExpression(call.expression)) {
    return undefined;
  }

  const method = call.expression.name.text;
  if (!PRISMA_METHODS.has(method)) {
    return undefined;
  }

  const receiver = call.expression.expression.getText(source);
  if (!looksLikePrismaReceiver(receiver, method)) {
    return undefined;
  }

  return {
    callText: call.getText(source),
    file: relativeFile,
    leadingText: readLeadingText(source, call),
    line: source.getLineAndCharacterOfPosition(call.getStart(source)).line + 1,
    method,
    receiver,
  };
}

function readPrismaTaggedTemplate(
  source: ts.SourceFile,
  relativeFile: string,
  taggedTemplate: ts.TaggedTemplateExpression,
): PrismaCall | undefined {
  if (!ts.isPropertyAccessExpression(taggedTemplate.tag)) {
    return undefined;
  }

  const method = taggedTemplate.tag.name.text;
  if (!PRISMA_METHODS.has(method)) {
    return undefined;
  }

  const receiver = taggedTemplate.tag.expression.getText(source);
  if (!looksLikePrismaReceiver(receiver, method)) {
    return undefined;
  }

  return {
    callText: taggedTemplate.getText(source),
    file: relativeFile,
    leadingText: readLeadingText(source, taggedTemplate),
    line:
      source.getLineAndCharacterOfPosition(taggedTemplate.getStart(source))
        .line + 1,
    method,
    receiver,
  };
}

function createFindingsForCall(call: PrismaCall): SqlRiskFinding[] {
  const findings: SqlRiskFinding[] = [];
  const callText = call.callText;

  if (call.method.includes('Unsafe')) {
    findings.push(
      createFinding(
        call,
        'raw-sql-unsafe',
        'high',
        'Replace unsafe raw SQL with Prisma.sql tagged templates or parameterized query helpers.',
      ),
    );
  } else if (
    (call.method === '$queryRaw' || call.method === '$executeRaw') &&
    !hasSuppression(call, 'raw-sql-review')
  ) {
    findings.push(
      createFinding(
        call,
        'raw-sql-review',
        'medium',
        'Run EXPLAIN ANALYZE with production-shaped data and confirm tenant filters, joins, and indexes.',
      ),
    );
  }

  if (isRowCollectionRead(call.method) && !hasPagination(callText)) {
    findings.push(
      createFinding(
        call,
        'unbounded-read',
        'medium',
        'Add take/limit/cursor pagination or document why the result set is bounded by the where clause.',
      ),
    );
  }

  if (isRowCollectionRead(call.method) && hasBroadInclude(callText)) {
    findings.push(
      createFinding(
        call,
        'broad-include',
        'medium',
        'Prefer select or a narrower include so reload paths do not hydrate unused relation graphs.',
      ),
    );
  }

  // `aggregate`/`groupBy` are SQL-side aggregations: an `aggregate` returns a
  // single row and a `groupBy` is bounded by group cardinality, so "add
  // pagination" never applies. Flagging them as `unbounded-read` (the behaviour
  // before this rule existed) produced false positives against the exact
  // SQL-aggregation pattern the analytics services were migrated to. The real
  // residual risk is an unindexed scan, so surface that at low severity instead.
  if (isAggregateRead(call.method)) {
    findings.push(
      createFinding(
        call,
        'aggregate-scan-review',
        'low',
        'Aggregate/groupBy results are bounded; pagination does not apply. Confirm the where clause (and any high-cardinality group key) is index-backed.',
      ),
    );
  }

  if (
    isBulkWrite(call.method) &&
    !hasTenantGuard(callText) &&
    !hasSuppression(call, 'bulk-write-tenant-review')
  ) {
    findings.push(
      createFinding(
        call,
        'bulk-write-tenant-review',
        'high',
        'Bulk writes need an explicit organization/user/isDeleted guard unless the model is global by design.',
      ),
    );
  }

  if (call.method === '$transaction' && callText.length > 2_000) {
    findings.push(
      createFinding(
        call,
        'large-transaction',
        'low',
        'Review transaction scope and move independent reads outside the transaction if possible.',
      ),
    );
  }

  return findings;
}

function readLeadingText(source: ts.SourceFile, node: ts.Node): string {
  const start = node.getStart(source);
  const { line } = source.getLineAndCharacterOfPosition(start);
  const windowStartLine = Math.max(0, line - 4);
  const windowStart = source.getPositionOfLineAndCharacter(windowStartLine, 0);

  return source.text.slice(windowStart, start);
}

function createFinding(
  call: PrismaCall,
  category: string,
  severity: SqlRiskSeverity,
  recommendation: string,
): SqlRiskFinding {
  return {
    category,
    file: call.file,
    line: call.line,
    method: call.method,
    receiver: call.receiver,
    recommendation,
    severity,
    snippet: call.callText.replace(/\s+/g, ' ').trim().slice(0, 500),
  };
}

function looksLikePrismaReceiver(receiver: string, method: string): boolean {
  if (method.startsWith('$')) {
    return /(^|\.)prisma$|(^|\.)tx$|transaction/i.test(receiver);
  }

  return (
    /\bprisma\b/i.test(receiver) ||
    /^this\.\w+$/i.test(receiver) ||
    /^tx\.\w+$/i.test(receiver) ||
    /^transaction\.\w+$/i.test(receiver)
  );
}

// Reads that return an unbounded set of entity rows and therefore need
// pagination. `aggregate`/`groupBy` are deliberately excluded — they aggregate
// server-side and are handled by `isAggregateRead`.
function isRowCollectionRead(method: string): boolean {
  return method === 'findMany';
}

// SQL-side aggregations whose result set is bounded by construction.
function isAggregateRead(method: string): boolean {
  return method === 'aggregate' || method === 'groupBy';
}

function isBulkWrite(method: string): boolean {
  return method === 'deleteMany' || method === 'updateMany';
}

function hasPagination(callText: string): boolean {
  return (
    /\btake\s*:/i.test(callText) ||
    /\bskip\s*:/i.test(callText) ||
    /\bcursor\s*:/i.test(callText) ||
    /\blimit\s+/i.test(callText) ||
    /\bLIMIT\s+\?/i.test(callText)
  );
}

function hasBroadInclude(callText: string): boolean {
  return (
    /\binclude\s*:\s*{/.test(callText) && !/\bselect\s*:\s*{/.test(callText)
  );
}

function hasTenantGuard(callText: string): boolean {
  const whereIndex = callText.search(/\bwhere\s*:/i);
  if (whereIndex === -1) {
    return false;
  }

  return /organization(Id)?\s*:|user(Id)?\s*:|brand(Id)?\s*:|isDeleted\s*:/i.test(
    callText.slice(whereIndex),
  );
}

function hasSuppression(call: PrismaCall, category: string): boolean {
  return new RegExp(
    `sql-risk-audit:\\s*ignore\\s+${escapeRegExp(category)}\\s+--\\s+\\S`,
    'i',
  ).test(call.leadingText);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countBy<T>(
  values: T[],
  getKey: (value: T) => string,
): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = getKey(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function severityRank(severity: SqlRiskSeverity): number {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

function formatCountLines(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `- ${key}: ${count}`);
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { failOnHigh: false, isJsonOutput: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.isJsonOutput = true;
    } else if (arg === '--fail-on-high') {
      options.failOnHigh = true;
    } else if (arg === '--out') {
      options.out = readRequiredArg(argv, index, arg);
      index += 1;
    } else if (arg === '--root') {
      options.rootDir = readRequiredArg(argv, index, arg);
      index += 1;
    }
  }

  return options;
}

function readRequiredArg(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function writeOutput(body: string, out?: string): void {
  if (!out) {
    process.stdout.write(body.endsWith('\n') ? body : `${body}\n`);
    return;
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, body, 'utf8');
}

function isMainModule(): boolean {
  return process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;
}

if (isMainModule()) {
  const options = parseArgs(process.argv.slice(2));
  const result = runSqlRiskAudit(options);
  const body = options.isJsonOutput
    ? `${JSON.stringify(result, null, 2)}\n`
    : formatSqlRiskAudit(result);

  writeOutput(body, options.out);

  // `--fail-on-high` turns the audit into a CI gate: any high-severity finding
  // (unsafe raw SQL or an unguarded bulk write) fails the build so prior
  // tenant-scoping work cannot silently regress.
  if (options.failOnHigh && result.summary.high > 0) {
    const highFindings = result.findings.filter(
      (finding) => finding.severity === 'high',
    );
    process.stderr.write(
      `\nSQL risk audit failed: ${result.summary.high} high-severity finding(s).\n` +
        highFindings
          .map(
            (finding) =>
              `  - ${finding.category} ${finding.file}:${finding.line} (${finding.method})`,
          )
          .join('\n') +
        '\n',
    );
    process.exitCode = 1;
  }
}
