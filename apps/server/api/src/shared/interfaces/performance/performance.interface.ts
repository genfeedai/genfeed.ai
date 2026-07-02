export type ApiPerformanceSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'ERROR';

export interface PrismaQueryMetric {
  duration: number;
  fingerprint: string;
  target: string;
  timestamp: string;
}

export interface RequestDatabaseMetrics {
  [key: string]: unknown;
  queryCount: number;
  queryDuration: number;
  slowQueries: PrismaQueryMetric[];
}

export interface PerformanceMetrics {
  method: string;
  url: string;
  route: string;
  duration: number;
  userAgent?: string;
  userId?: string;
  statusCode?: number;
  timestamp: string;
}

export interface ApiPerformanceTelemetryInput {
  databaseMetrics?: RequestDatabaseMetrics;
  errorMessage?: string;
  metrics: PerformanceMetrics;
  severity: ApiPerformanceSeverity;
}

export interface MetricAttributes {
  [key: string]: unknown;
  method: string;
  route: string;
  severity: ApiPerformanceSeverity;
  status_code: string;
}
