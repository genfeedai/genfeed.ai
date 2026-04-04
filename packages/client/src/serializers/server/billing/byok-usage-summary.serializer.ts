import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { byokUsageSummarySerializerConfig } from '../../configs';

export const ByokUsageSummarySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  byokUsageSummarySerializerConfig,
);
