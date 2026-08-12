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
