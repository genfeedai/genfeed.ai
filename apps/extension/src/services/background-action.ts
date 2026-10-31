import type { ImportedSourceResponse } from '~models/imported-source.model';

/** A background action that answered `success: false`. */
export class BackgroundActionError extends Error {
  readonly code?: string;
  readonly deletedSourceId?: string;

  constructor(message: string, code?: string, deletedSourceId?: string) {
    super(message);
    this.name = 'BackgroundActionError';
    this.code = code;
    this.deletedSourceId = deletedSourceId;
  }
}

/** Sends one explicit action to the background and unwraps its answer. */
export async function backgroundAction<T>(
  message: Record<string, unknown>,
): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as
    | ImportedSourceResponse<T>
    | undefined;
  if (!response?.success) {
    throw new BackgroundActionError(
      response?.error || 'The extension could not reach Genfeed. Try again.',
      response?.code,
      response?.deletedSourceId,
    );
  }
  return response.data as T;
}
