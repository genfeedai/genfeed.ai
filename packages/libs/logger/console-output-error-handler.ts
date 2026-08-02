import { captureException } from '@sentry/nestjs';

export type ConsoleOutputStreamName = 'stderr' | 'stdout';

export type ConsoleOutputErrorContext = Readonly<{
  operation: 'write';
  processId: number;
  service: string;
  stream: ConsoleOutputStreamName;
}>;

export type ConsoleOutputErrorReporter = (
  error: unknown,
  context: ConsoleOutputErrorContext,
) => void;

export type ConsoleOutputStream = {
  off(event: 'error', listener: (error: unknown) => void): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
};

export type SilencableConsoleTransport = {
  silent?: boolean;
};

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
}

function reportUnexpectedConsoleOutputError(
  error: unknown,
  context: ConsoleOutputErrorContext,
): void {
  const errorCode = getErrorCode(error);
  const transportError = new Error(
    `Logger ${context.stream} write failed for ${context.service}${
      errorCode ? ` (${errorCode})` : ''
    }`,
    error instanceof Error ? { cause: error } : undefined,
  );

  captureException(transportError, {
    contexts: {
      logger_output: context,
    },
    level: 'error',
    tags: {
      'logger.operation': context.operation,
      'logger.service': context.service,
      'logger.stream': context.stream,
    },
  });
}

/**
 * Prevent a closed console peer from turning a normal service shutdown into an
 * uncaught exception. Winston writes directly to process.stdout/process.stderr,
 * so the error must be handled on those streams rather than on the logger.
 */
export function attachConsoleOutputErrorHandlers(
  transport: SilencableConsoleTransport,
  stdout: ConsoleOutputStream = process.stdout,
  stderr: ConsoleOutputStream = process.stderr,
  reportUnexpected: ConsoleOutputErrorReporter = reportUnexpectedConsoleOutputError,
): () => void {
  const service = process.env.SERVICE_NAME ?? 'unknown';

  const createHandler =
    (stream: ConsoleOutputStreamName) =>
    (error: unknown): void => {
      if (getErrorCode(error) === 'EPIPE') {
        // The output peer is gone. Keep this listener attached to absorb the
        // failed write and stop Winston from attempting subsequent writes.
        transport.silent = true;
        return;
      }

      reportUnexpected(error, {
        operation: 'write',
        processId: process.pid,
        service,
        stream,
      });
    };

  const handleStdoutError = createHandler('stdout');
  const handleStderrError = createHandler('stderr');

  stdout.on('error', handleStdoutError);
  stderr.on('error', handleStderrError);

  return () => {
    stdout.off('error', handleStdoutError);
    stderr.off('error', handleStderrError);
  };
}
