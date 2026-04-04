import { buildSerializer } from '@serializers/builders';
import { crmReviewContentSerializerConfig } from '@serializers/configs';

export const { CrmReviewContentSerializer } = buildSerializer(
  'server',
  crmReviewContentSerializerConfig,
);
