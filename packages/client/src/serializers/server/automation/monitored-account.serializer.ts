import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { monitoredAccountSerializerConfig } from '../../configs';

export const MonitoredAccountSerializer: BuiltSerializer =
  buildSingleSerializer('server', monitoredAccountSerializerConfig);
