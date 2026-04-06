import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomLipSyncJobSerializerConfig } from '../../configs';

export const DarkroomLipSyncJobSerializer: BuiltSerializer =
  buildSingleSerializer('server', darkroomLipSyncJobSerializerConfig);
