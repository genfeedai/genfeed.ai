import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import { buildSerializer } from '@serializers/builders';
import { brandedGenerationReceiptRevisionSerializerConfig } from '@serializers/configs/content/branded-generation-receipt-revision.config';
export const { BrandedGenerationReceiptRevisionSerializer } = buildSerializer(
  'server',
  brandedGenerationReceiptRevisionSerializerConfig,
);
const serialize = BrandedGenerationReceiptRevisionSerializer.serialize.bind(
  BrandedGenerationReceiptRevisionSerializer,
);
function revision(payload: unknown) {
  const receipt = brandedGenerationReceiptV1Schema.parse(payload);
  return {
    ...receipt,
    receiptId: receipt.id,
    id: `${receipt.id}:${receipt.revision}`,
  };
}
BrandedGenerationReceiptRevisionSerializer.serialize = (payload: unknown) =>
  serialize(
    payload === null
      ? null
      : Array.isArray(payload)
        ? payload.map(revision)
        : revision(payload),
  );
