import {
  brandedGenerationPromptInspectionSourceV1Schema,
  brandedGenerationPromptInspectionV1Schema,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-receipt-read.contract';
import { buildSerializer } from '@serializers/builders';
import { brandedGenerationPromptInspectionSerializerConfig } from '@serializers/configs/content/branded-generation-prompt-inspection.config';
export const { BrandedGenerationPromptInspectionSerializer } = buildSerializer(
  'server',
  brandedGenerationPromptInspectionSerializerConfig,
);
const serialize = BrandedGenerationPromptInspectionSerializer.serialize.bind(
  BrandedGenerationPromptInspectionSerializer,
);
function inspection(payload: unknown) {
  const { receiptId, receiptRevision, stage, result } =
    brandedGenerationPromptInspectionSourceV1Schema.parse(payload);
  return brandedGenerationPromptInspectionV1Schema.parse({
    id: `${receiptId}:${receiptRevision}:${stage}`,
    receiptId,
    receiptRevision,
    stage,
    ...result,
    ...(result.status === 'retained'
      ? { reasonCode: null }
      : { text: null, contentHash: null }),
  });
}
BrandedGenerationPromptInspectionSerializer.serialize = (payload: unknown) =>
  serialize(
    payload === null
      ? null
      : Array.isArray(payload)
        ? payload.map(inspection)
        : inspection(payload),
  );
