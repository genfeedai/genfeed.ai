import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { crmReviewContentSerializerConfig } from '../../configs';

export const CrmReviewContentSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  crmReviewContentSerializerConfig,
);
