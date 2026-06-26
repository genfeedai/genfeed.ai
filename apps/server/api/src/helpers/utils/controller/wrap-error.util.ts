import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Run a controller operation, preserving any `HttpException` it throws (so a
 * service-thrown 400/404 reaches the client with its real status) and mapping
 * every other error to a generic 500.
 *
 * Replaces the hand-rolled `try { ... } catch { throw new HttpException(...,
 * INTERNAL_SERVER_ERROR) }` boilerplate that used to be copy-pasted across the
 * workflows controllers — several copies of which omitted the `instanceof
 * HttpException` rethrow and silently downgraded real 4xx errors to 500.
 */
export async function wrapError<T>(
  fn: () => Promise<T>,
  fallbackMessage = 'Operation failed',
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    if (error instanceof HttpException) {
      throw error;
    }
    const message = (error as Error)?.message ?? fallbackMessage;
    throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
