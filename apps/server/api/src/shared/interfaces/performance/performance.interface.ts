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
