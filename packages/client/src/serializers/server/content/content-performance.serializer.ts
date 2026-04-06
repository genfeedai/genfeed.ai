import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { contentPerformanceSerializerConfig } from '../../configs';

export const ContentPerformanceSerializer: BuiltSerializer =
  buildSingleSerializer('server', contentPerformanceSerializerConfig);
