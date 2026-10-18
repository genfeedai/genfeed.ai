import { HttpException } from '@nestjs/common';

/**
 * Client-safe detail from repurpose validation failures. Only 4xx
 * HttpException responses carry actionable catalog messages; 5xx and
 * non-HTTP errors are withheld so internal details never leak into
 * model-visible output.
 */
export function readRepurposeErrorDetail(error: unknown): string | undefined {
  if (!(error instanceof HttpException) || error.getStatus() >= 500) {
    return undefined;
  }

  const response = error.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (response && typeof response === 'object') {
    const detail = (response as { detail?: unknown; message?: unknown }).detail;
    if (typeof detail === 'string' && detail.length > 0) {
      return detail;
    }
    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return error.message || undefined;
}
