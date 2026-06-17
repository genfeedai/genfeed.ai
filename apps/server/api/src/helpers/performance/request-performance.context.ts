import { AsyncLocalStorage } from 'node:async_hooks';
import process from 'node:process';
import type { Prisma } from '@genfeedai/prisma';

export interface PrismaQueryMetric {
  duration: number;
  fingerprint: string;
  target: string;
  timestamp: string;
}

export interface RequestDatabaseMetrics {
  queryCount: number;
  queryDuration: number;
  slowQueries: PrismaQueryMetric[];
}

interface RequestPerformanceStore {
  queryCount: number;
  queryDuration: number;
  slowQueries: PrismaQueryMetric[];
}

const storage = new AsyncLocalStorage<RequestPerformanceStore>();

export function isPrismaQueryMetricsEnabled(): boolean {
  return (
    process.env.API_QUERY_METRICS === 'true' ||
    process.env.API_PERFORMANCE_AUDIT === 'true'
  );
}

export function createRequestPerformanceStore(): RequestPerformanceStore {
  return {
    queryCount: 0,
    queryDuration: 0,
    slowQueries: [],
  };
}

export function runWithRequestPerformance<T>(
  store: RequestPerformanceStore,
  callback: () => T,
): T {
  return storage.run(store, callback);
}

export function recordPrismaQuery(event: Prisma.QueryEvent): void {
  if (!isPrismaQueryMetricsEnabled()) {
    return;
  }

  const store = storage.getStore();
  if (!store) {
    return;
  }

  store.queryCount += 1;
  store.queryDuration += event.duration;

  const slowQueryThreshold = readPositiveNumber(
    process.env.API_SLOW_QUERY_THRESHOLD_MS,
    100,
  );

  if (event.duration < slowQueryThreshold) {
    return;
  }

  const maxSlowQueries = readPositiveNumber(
    process.env.API_SLOW_QUERY_SAMPLE_SIZE,
    5,
  );

  const metric: PrismaQueryMetric = {
    duration: event.duration,
    fingerprint: fingerprintSql(event.query),
    target: event.target,
    timestamp: event.timestamp.toISOString(),
  };

  if (store.slowQueries.length < maxSlowQueries) {
    store.slowQueries.push(metric);
    return;
  }

  const fastestIndex = store.slowQueries.reduce(
    (selectedIndex, query, index) => {
      return query.duration < store.slowQueries[selectedIndex].duration
        ? index
        : selectedIndex;
    },
    0,
  );

  if (metric.duration > store.slowQueries[fastestIndex].duration) {
    store.slowQueries[fastestIndex] = metric;
  }
}

export function getRequestDatabaseMetrics():
  | RequestDatabaseMetrics
  | undefined {
  const store = storage.getStore();
  if (!store || store.queryCount === 0) {
    return undefined;
  }

  return {
    queryCount: store.queryCount,
    queryDuration: Math.round(store.queryDuration),
    slowQueries: [...store.slowQueries].sort((left, right) => {
      return right.duration - left.duration;
    }),
  };
}

function readPositiveNumber(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function fingerprintSql(sql: string): string {
  return sql
    .replace(/'([^']|'')*'/g, '?')
    .replace(/"([^"]|"")*"/g, '?')
    .replace(/\$\d+/g, '?')
    .replace(/\b\d+\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}
