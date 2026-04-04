export interface IErrorDebugInfo {
  message: string;
  timestamp: string;
  url?: string;
  method?: string;
  status?: number;
  statusText?: string;
  errorCode?: string;
  stack?: string;
  context?: Record<string, unknown>;
  request?: {
    headers?: Record<string, string>;
    body?: unknown;
    params?: Record<string, string>;
  };
  response?: {
    data?: unknown;
    headers?: Record<string, string>;
  };
  onRetry?: () => void;
}
