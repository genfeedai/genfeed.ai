const IPC_ERROR_PREFIX_PATTERN =
  /^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/;

/** The message of an error thrown across Electron IPC, without Electron's prefix. */
export function readIpcErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  return message.replace(IPC_ERROR_PREFIX_PATTERN, '');
}
