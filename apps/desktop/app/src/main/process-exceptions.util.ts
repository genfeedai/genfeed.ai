export const DESKTOP_PROCESS_EXCEPTION_SOURCE = {
  UNCAUGHT_EXCEPTION: 'uncaughtException',
  UNHANDLED_REJECTION: 'unhandledRejection',
} as const;

export type DesktopProcessExceptionSource =
  (typeof DESKTOP_PROCESS_EXCEPTION_SOURCE)[keyof typeof DESKTOP_PROCESS_EXCEPTION_SOURCE];

interface DesktopProcessExceptionHandlerOptions {
  captureException: (
    error: unknown,
    context: { source: DesktopProcessExceptionSource },
  ) => void;
  exit: (code: number) => void;
  isAppReady: () => boolean;
  showFailureScreen: (error: unknown) => Promise<void>;
  writeError: (message: string) => void;
}

const IGNORABLE_IO_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ERR_STREAM_DESTROYED',
]);

export function isIgnorableDesktopIoException(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  const fd = 'fd' in error ? error.fd : undefined;
  const syscall = 'syscall' in error ? error.syscall : undefined;
  return (
    typeof code === 'string' &&
    IGNORABLE_IO_CODES.has(code) &&
    typeof fd === 'number' &&
    fd >= 0 &&
    fd <= 2 &&
    (syscall === 'read' || syscall === 'write')
  );
}

export function createDesktopProcessExceptionHandler({
  captureException,
  exit,
  isAppReady,
  showFailureScreen,
  writeError,
}: DesktopProcessExceptionHandlerOptions): (
  error: unknown,
  source: DesktopProcessExceptionSource,
) => void {
  let isHandling = false;

  return (error, source) => {
    if (isIgnorableDesktopIoException(error)) {
      try {
        writeError(
          `[desktop] ${source}: ignored broken stdio (${error instanceof Error ? error.message : String(error)})\n`,
        );
      } catch {
        // stderr may already be the broken pipe.
      }
      return;
    }

    if (isHandling) {
      exit(1);
      return;
    }

    isHandling = true;

    const errorText =
      error instanceof Error ? error.stack || error.message : String(error);
    writeError(`[desktop] ${source}: ${errorText}\n`);
    captureException(error, { source });

    if (!isAppReady()) {
      exit(1);
      return;
    }

    void showFailureScreen(error).catch(() => {
      exit(1);
    });
  };
}
