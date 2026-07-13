import { buildSerializer } from '@serializers/builders';
import { publishApprovalSerializerConfig } from '@serializers/configs';

export const { PublishApprovalSerializer } = buildSerializer(
  'server',
  publishApprovalSerializerConfig,
);
