import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { byokUsageSummarySerializerConfig } from '../../configs';

export const ByokUsageSummarySerializer: BuiltSerializer =
  buildSingleSerializer('server', byokUsageSummarySerializerConfig);
