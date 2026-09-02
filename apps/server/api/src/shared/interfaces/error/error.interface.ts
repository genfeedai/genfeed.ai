/**
 * Standardized error interface for API responses
 * This interface is shared between backend and frontend
 */
export interface IApiError {
  /**
   * HTTP status code
   */
  status: number;

  /**
   * Error code for programmatic error handling
   */
  code: string;

  /**
   * Human-readable error title
   */
  title: string;

  /**
   * Detailed error message
   */
  detail: string;

  /**
   * ISO timestamp of when the error occurred
   */
  timestamp: string;

  /**
   * Optional metadata for additional context
   */
  meta?: Record<string, unknown>;

  /**
   * Request ID for tracing
   */
  requestId?: string;

  /**
   * Validation errors for specific fields
   */
  validationErrors?: Array<{
    field: string;
    message: string;
    code?: string;
  }>;
}
