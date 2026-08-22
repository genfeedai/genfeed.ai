export interface FalModelSyncArgs {
  live: true;
}

export function parseFalModelSyncArgs(
  args: readonly string[],
): FalModelSyncArgs {
  if (args.length !== 1 || args[0] !== '--live') {
    throw new Error(
      'Fal model synchronization is write-enabled; invoke it explicitly with --live.',
    );
  }
  return { live: true };
}

export function assertFalApiKeyConfigured(apiKey: string | undefined): void {
  if (!apiKey?.trim()) {
    throw new Error(
      'FAL_API_KEY must be configured for Fal model synchronization.',
    );
  }
}
