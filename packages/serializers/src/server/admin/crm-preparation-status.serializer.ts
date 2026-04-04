import { buildSerializer } from '@serializers/builders';
import { crmPreparationStatusSerializerConfig } from '@serializers/configs';

export const { CrmPreparationStatusSerializer } = buildSerializer(
  'server',
  crmPreparationStatusSerializerConfig,
);
