import type { IErrorDebugInfo } from '../modals/error-debug.interface';
export interface IHttpInterceptorError extends Error {
    debugInfo?: IErrorDebugInfo;
    isAuthError?: boolean;
    isNetworkError?: boolean;
    isTimeout?: boolean;
}
export interface IHttpCancelledError {
    isCancelled: true;
    silent: true;
}
export interface IHttpSanitizedError {
    message: string;
    status: number;
    statusText: string;
}
//# sourceMappingURL=http-interceptor-error.interface.d.ts.map