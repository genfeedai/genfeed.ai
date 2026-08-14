import { IngredientStatus } from '@genfeedai/enums';

export function shouldFinalizeExternalOutput(result: {
  kind: string;
  outputUrls?: string[];
}): boolean {
  return result.kind === 'external-id' && Boolean(result.outputUrls);
}

export function isProcessingIngredient(
  current: {
    status?: string;
  } | null,
): boolean {
  return Boolean(current && current.status === IngredientStatus.PROCESSING);
}

export function optionalUploadString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function missingOutputUrlMessage(outputIndex: number): string {
  return `Image provider returned no output URL at index ${outputIndex}`;
}
