import type { Severity } from '@genfeedai/enums';
import type { ComponentType, ReactNode } from 'react';

export interface IServiceSerializer<T> {
  serialize: (data: Partial<T>) => unknown;
}

export interface IServiceConstructor<T> {
  new (token: string): T;
  classInstance?: T | null;
  currentToken?: string | null;
}

export interface IServiceWithInstance<T> {
  getInstance: (token: string) => T;
}

export interface IError {
  message: string;
  code?: string;
  timestamp?: string;
  stack?: string;
}

export interface IAppError extends IError {
  name: string;
  statusCode?: number;
  context?: Record<string, unknown>;
  userMessage?: string;
  technicalMessage?: string;
  isOperational?: boolean;
}

export interface IHttpErrorConfig {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  data?: unknown;
  params?: Record<string, unknown>;
  timeout?: number;
}

export interface IHttpError extends IError {
  statusCode: number;
  statusText?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  response?: {
    status?: number;
    statusText?: string;
    data?: unknown;
    headers?: Record<string, string>;
  };
  config?: IHttpErrorConfig;
}

export interface IStructuredError extends IError {
  name: string;
  status?: number;
  validationErrors?: Record<string, string[]>;
  originalError?: unknown;
  details?: Record<string, unknown>;
  severity?: Severity;
  category?: string;
  recoverable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IValidationError extends IError {
  field: string;
  value?: unknown;
  constraints?: Record<string, string>;
}

export interface IFormErrors {
  [key: string]: string | string[] | IFormErrors;
}

export type IFormErrorValue = string | string[] | IFormErrors;

export interface IJsonApiError {
  code: number;
  title: string;
  detail: string;
  source?: {
    pointer?: string;
    parameter?: string;
  };
  meta?: Record<string, unknown>;
}

export interface IJsonApiErrorResponse {
  errors: IJsonApiError[];
}

export interface IApiErrorResponse {
  error: IAppError;
  errors?: IValidationError[];
  requestId?: string;
  timestamp: string;
}

export interface ICustomApiError {
  title: string;
  detail: string;
  code: string;
  status: number;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export interface IErrorInfo {
  componentStack?: string;
}

export interface IErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, errorInfo: IErrorInfo) => ReactNode);
  onError?: (error: Error, errorInfo: IErrorInfo) => void;
  resetKeys?: string[];
  resetOnPropsChange?: boolean;
  isolate?: boolean;
  level?: 'page' | 'section' | 'component';
}

export interface IErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
  errorStack?: string;
  retryCount: number;
}

export interface IEnhancedErrorBoundaryProps extends IErrorBoundaryProps {
  maxRetries?: number;
  retryDelay?: number;
  onRetry?: () => void;
  showErrorDetails?: boolean;
  logErrors?: boolean;
  errorComponent?: ComponentType<IErrorComponentProps>;
}

export interface IErrorComponentProps {
  error: Error;
  retry?: () => void;
  reset?: () => void;
  errorInfo?: IErrorInfo;
  showDetails?: boolean;
}

export interface IGlobalErrorProps {
  error: Error & { digest?: string };
  reset?: () => void;
}

export interface GlobalErrorProps {
  error: Error & { digest?: string };
}

export interface IGlobalErrorHandler {
  handleError(error: Error | IAppError): void;
  handleAsyncError(error: Error | IAppError): Promise<void>;
  logError(error: Error | IAppError, context?: Record<string, unknown>): void;
  clearErrors(): void;
}

export interface IErrorLogContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  url?: string;
  method?: string;
  userAgent?: string;
  timestamp: string;
  environment?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

export interface IErrorRecoveryStrategy {
  shouldRecover(error: Error): boolean;
  recover(error: Error): Promise<void>;
  maxAttempts?: number;
  backoffMultiplier?: number;
  initialDelay?: number;
}

export interface IRetryConfig {
  maxAttempts: number;
  delay: number;
  backoff?: 'linear' | 'exponential';
  shouldRetry?: (error: unknown, attempt?: number) => boolean;
}
