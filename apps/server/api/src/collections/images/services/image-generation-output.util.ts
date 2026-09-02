import { IngredientStatus } from '@genfeedai/contracts';

type ExternalImageOutputResult = {
  kind: 'external-id';
  outputUrls: string[];
};

export function shouldFinalizeExternalOutput(result: {
  kind: string;
  outputUrls?: string[];
}): result is ExternalImageOutputResult {
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
