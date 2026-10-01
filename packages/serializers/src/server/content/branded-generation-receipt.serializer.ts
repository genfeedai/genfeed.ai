import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts';
import { buildSerializer } from '@serializers/builders';
import { brandedGenerationReceiptSerializerConfig } from '@serializers/configs/content/branded-generation-receipt.config';
export const { BrandedGenerationReceiptSerializer } = buildSerializer(
  'server',
  brandedGenerationReceiptSerializerConfig,
);
const serialize = BrandedGenerationReceiptSerializer.serialize.bind(
  BrandedGenerationReceiptSerializer,
);
BrandedGenerationReceiptSerializer.serialize = (payload: unknown) =>
  serialize(
    payload === null
      ? null
      : Array.isArray(payload)
        ? payload.map((receipt) =>
            brandedGenerationReceiptV1Schema.parse(receipt),
          )
        : brandedGenerationReceiptV1Schema.parse(payload),
  );
