import { HttpException } from '@nestjs/common';

/** What Nest puts in `Error.message` when the response body is an object. */
const GENERIC_HTTP_EXCEPTION_MESSAGE = 'Http Exception';

function readText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() ? value : undefined;
  }
  if (Array.isArray(value)) {
    const messages = value.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
    return messages.length > 0 ? messages.join('; ') : undefined;
  }
  return undefined;
}

/**
 * The reason an exception carries. `new HttpException({ detail, title }, 4xx)`
 * reports `Error.message` as the class name ("Http Exception"), so a caller
 * that reads `.message` shows the person nothing. This reads the reason from
 * the response body (`detail`, then `message`, then `title`) and falls back to
 * `Error.message` unless that is only the class name.
 */
export function readHttpExceptionDetail(error: unknown): string | undefined {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const fromString = readText(response);
    if (fromString) {
      return fromString;
    }
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      const body = response as Record<string, unknown>;
      const detail = readText(body.detail) ?? readText(body.message);
      const title = readText(body.title);
      if (detail && title && !detail.includes(title)) {
        return `${title}: ${detail}`;
      }
      if (detail ?? title) {
        return detail ?? title;
      }
    }
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    return message && message !== GENERIC_HTTP_EXCEPTION_MESSAGE
      ? message
      : undefined;
  }
  return typeof error === 'string' && error.trim() ? error : undefined;
}
