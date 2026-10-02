import { readImageEditingRecipe } from '@genfeedai/contracts/constants';

export function serializeImageEdit(record: Record<string, unknown>) {
  const metadata = record.metadata;
  if (typeof metadata !== 'object' || metadata === null) return undefined;
  const providerData = (metadata as Record<string, unknown>).providerData;
  if (typeof providerData !== 'object' || providerData === null)
    return undefined;
  return readImageEditingRecipe(
    (providerData as Record<string, unknown>).imageEdit,
  );
}
