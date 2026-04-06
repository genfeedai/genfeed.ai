import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { performanceSummarySerializerConfig } from '../../configs';

export const PerformanceSummarySerializer: BuiltSerializer =
  buildSingleSerializer('server', performanceSummarySerializerConfig);
