import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const HTTP_METHODS = ['get', 'head', 'post', 'put', 'patch', 'delete'] as const;
type OpenApiHttpMethod = (typeof HTTP_METHODS)[number];

interface OpenApiParameter {
  in?: string;
  name?: string;
  required?: boolean;
}

interface OpenApiOperation {
  operationId?: string;
  parameters?: OpenApiParameter[];
  security?: unknown[];
  summary?: string;
}

interface OpenApiDocument {
  paths?: Record<string, Partial<Record<OpenApiHttpMethod, OpenApiOperation>>>;
}

interface SmokeTarget {
  method: string;
  operationId?: string;
  path: string;
  skipReason?: string;
}

interface SmokeResult {
  duration: number;
  error?: string;
  method: string;
  operationId?: string;
  path: string;
  status?: number;
  statusText?: string;
}

export interface OpenApiSmokeOptions {
  baseUrl?: string;
  budgetMs?: number;
  concurrency?: number;
  openApiUrl?: string;
  timeoutMs?: number;
  token?: string;
}

export interface OpenApiSmokeReport {
  baseUrl: string;
  budgetMs: number;
  completed: SmokeResult[];
  generatedAt: string;
  openApiUrl: string;
  skipped: SmokeTarget[];
  summary: {
    authMissing: number;
    failed: number;
    passed: number;
    p50: number;
    p95: number;
    skipped: number;
    slow: number;
    targets: number;
  };
}

interface CliOptions extends OpenApiSmokeOptions {
  json: boolean;
  out?: string;
}

export async function runOpenApiSmoke(
  options: OpenApiSmokeOptions = {},
): Promise<OpenApiSmokeReport> {
  const baseUrl = normalizeBaseUrl(
    options.baseUrl ??
      process.env.API_AUDIT_BASE_URL ??
      'http://local.genfeed.ai:3010/v1',
  );
  const openApiUrl =
    options.openApiUrl ??
    process.env.API_AUDIT_OPENAPI_URL ??
    `${baseUrl}/openapi.json`;
  const token = options.token ?? process.env.API_AUDIT_BEARER_TOKEN;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const budgetMs = options.budgetMs ?? 1_000;
  const concurrency = options.concurrency ?? 8;
  const document = await fetchOpenApiDocument(openApiUrl, timeoutMs);
  const { skipped, targets } = collectSmokeTargets(document);
  const completed = await runWithConcurrency(targets, concurrency, (target) => {
    return smokeTarget(baseUrl, target, { timeoutMs, token });
  });
  const durations = completed
    .filter((result) => result.status !== undefined && !result.error)
    .map((result) => result.duration)
    .sort((left, right) => left - right);
  const p50 = percentile(durations, 0.5);
  const p95 = percentile(durations, 0.95);
  const authMissing = completed.filter((result) => {
    return !token && (result.status === 401 || result.status === 403);
  }).length;
  const failed = completed.filter((result) => {
    return (
      Boolean(result.error) ||
      (result.status !== undefined && result.status >= 500)
    );
  }).length;
  const passed = completed.filter((result) => {
    return (
      result.status !== undefined && result.status >= 200 && result.status < 400
    );
  }).length;

  return {
    baseUrl,
    budgetMs,
    completed,
    generatedAt: new Date().toISOString(),
    openApiUrl,
    skipped,
    summary: {
      authMissing,
      failed,
      passed,
      p50,
      p95,
      skipped: skipped.length,
      slow: completed.filter((result) => result.duration > budgetMs).length,
      targets: targets.length,
    },
  };
}

export function formatOpenApiSmokeReport(report: OpenApiSmokeReport): string {
  const lines = [
    '# API OpenAPI Smoke Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Base URL: ${report.baseUrl}`,
    `OpenAPI URL: ${report.openApiUrl}`,
    '',
    `Targets: ${report.summary.targets}`,
    `Passed: ${report.summary.passed}`,
    `Auth missing: ${report.summary.authMissing}`,
    `Failed: ${report.summary.failed}`,
    `Skipped: ${report.summary.skipped}`,
    `p50: ${report.summary.p50}ms`,
    `p95: ${report.summary.p95}ms`,
    `Slow over budget (${report.budgetMs}ms): ${report.summary.slow}`,
    '',
    '## Completed',
    '',
    '| Status | Duration | Method | Path | Operation | Error |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const result of report.completed) {
    lines.push(
      [
        result.status ? String(result.status) : 'timeout',
        `${result.duration}ms`,
        result.method,
        result.path,
        result.operationId ?? '-',
        result.error ?? '-',
      ]
        .map(escapeMarkdownCell)
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    );
  }

  lines.push(
    '',
    '## Skipped',
    '',
    '| Reason | Method | Path | Operation |',
    '| --- | --- | --- | --- |',
  );

  for (const target of report.skipped) {
    lines.push(
      [
        target.skipReason ?? '-',
        target.method,
        target.path,
        target.operationId ?? '-',
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

async function fetchOpenApiDocument(
  openApiUrl: string,
  timeoutMs: number,
): Promise<OpenApiDocument> {
  const response = await fetchWithTimeout(openApiUrl, { timeoutMs });
  if (!response.ok) {
    throw new Error(
      `OpenAPI fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as OpenApiDocument;
}

function collectSmokeTargets(document: OpenApiDocument): {
  skipped: SmokeTarget[];
  targets: SmokeTarget[];
} {
  const skipped: SmokeTarget[] = [];
  const targets: SmokeTarget[] = [];

  for (const [apiPath, operations] of Object.entries(document.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = operations[method];
      if (!operation) {
        continue;
      }

      if (method !== 'get' && method !== 'head') {
        skipped.push({
          method: method.toUpperCase(),
          operationId: operation.operationId,
          path: apiPath,
          skipReason: 'non-idempotent method',
        });
        continue;
      }

      const requiredPathParams = (operation.parameters ?? []).filter(
        (param) => {
          return param.in === 'path' && param.required;
        },
      );
      const requiredQueryParams = (operation.parameters ?? []).filter(
        (param) => {
          return param.in === 'query' && param.required;
        },
      );

      if (requiredPathParams.length > 0 || /\{[^}]+}/.test(apiPath)) {
        skipped.push({
          method: method.toUpperCase(),
          operationId: operation.operationId,
          path: apiPath,
          skipReason: 'path params',
        });
        continue;
      }

      if (requiredQueryParams.length > 0) {
        skipped.push({
          method: method.toUpperCase(),
          operationId: operation.operationId,
          path: apiPath,
          skipReason: 'required query params',
        });
        continue;
      }

      targets.push({
        method: method.toUpperCase(),
        operationId: operation.operationId,
        path: apiPath,
      });
    }
  }

  return { skipped, targets };
}

async function smokeTarget(
  baseUrl: string,
  target: SmokeTarget,
  options: { timeoutMs: number; token?: string },
): Promise<SmokeResult> {
  const startedAt = performance.now();
  try {
    const response = await fetchWithTimeout(`${baseUrl}${target.path}`, {
      headers: options.token
        ? { Authorization: `Bearer ${options.token}` }
        : undefined,
      method: target.method,
      timeoutMs: options.timeoutMs,
    });

    return {
      duration: Math.round(performance.now() - startedAt),
      method: target.method,
      operationId: target.operationId,
      path: target.path,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    return {
      duration: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      method: target.method,
      operationId: target.operationId,
      path: target.path,
    };
  }
}

async function fetchWithTimeout(
  url: string,
  options: {
    headers?: Record<string, string>;
    method?: string;
    timeoutMs: number;
  },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    return await fetch(url, {
      headers: options.headers,
      method: options.method,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function runWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(values[currentIndex]);
      }
    }),
  );

  return results;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(
    values.length - 1,
    Math.ceil(values.length * percentileValue) - 1,
  );
  return Math.round(values[index]);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/g, '');
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function parseNumberArg(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--base-url') {
      options.baseUrl = argv[index + 1];
      index += 1;
    } else if (arg === '--openapi-url') {
      options.openApiUrl = argv[index + 1];
      index += 1;
    } else if (arg === '--token') {
      options.token = argv[index + 1];
      index += 1;
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = parseNumberArg(argv[index + 1], 5_000);
      index += 1;
    } else if (arg === '--budget-ms') {
      options.budgetMs = parseNumberArg(argv[index + 1], 1_000);
      index += 1;
    } else if (arg === '--concurrency') {
      options.concurrency = parseNumberArg(argv[index + 1], 8);
      index += 1;
    } else if (arg === '--out') {
      options.out = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function writeOutput(body: string, out?: string): void {
  if (!out) {
    console.log(body);
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
  const report = await runOpenApiSmoke(options);
  const body = options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatOpenApiSmokeReport(report);

  writeOutput(body, options.out);

  if (report.summary.failed > 0 || report.summary.p95 > report.budgetMs) {
    process.exitCode = 1;
  }
}
