import {
  brandedGenerationFeedbackReadV1Schema,
  brandedGenerationFeedbackSummaryV1Schema,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import { buildSerializer } from '@serializers/builders';
import { brandedGenerationFeedbackSerializerConfig } from '@serializers/configs/content/branded-generation-feedback.config';
import { brandedGenerationFeedbackSummarySerializerConfig } from '@serializers/configs/content/branded-generation-feedback-summary.config';

export const { BrandedGenerationFeedbackSerializer } = buildSerializer(
  'server',
  brandedGenerationFeedbackSerializerConfig,
);
export const { BrandedGenerationFeedbackSummarySerializer } = buildSerializer(
  'server',
  brandedGenerationFeedbackSummarySerializerConfig,
);
const serializeFeedback = BrandedGenerationFeedbackSerializer.serialize.bind(
  BrandedGenerationFeedbackSerializer,
);
const serializeSummary =
  BrandedGenerationFeedbackSummarySerializer.serialize.bind(
    BrandedGenerationFeedbackSummarySerializer,
  );
BrandedGenerationFeedbackSerializer.serialize = (payload: unknown) =>
  serializeFeedback(
    payload === null
      ? null
      : Array.isArray(payload)
        ? payload.map((value) =>
            brandedGenerationFeedbackReadV1Schema.parse(value),
          )
        : brandedGenerationFeedbackReadV1Schema.parse(payload),
  );
BrandedGenerationFeedbackSummarySerializer.serialize = (payload: unknown) =>
  serializeSummary(
    payload === null
      ? null
      : Array.isArray(payload)
        ? payload.map((value) =>
            brandedGenerationFeedbackSummaryV1Schema.parse(value),
          )
        : brandedGenerationFeedbackSummaryV1Schema.parse(payload),
  );
