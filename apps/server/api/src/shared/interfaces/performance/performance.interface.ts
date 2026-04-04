export interface PerformanceMetrics {
  method: string;
  url: string;
  duration: number;
  userAgent?: string;
  userId?: string;
  statusCode?: number;
  timestamp: string;
}
