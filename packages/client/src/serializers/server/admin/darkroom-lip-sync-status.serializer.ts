import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomLipSyncStatusSerializerConfig } from '../../configs';

export const DarkroomLipSyncStatusSerializer: BuiltSerializer =
  buildSingleSerializer('server', darkroomLipSyncStatusSerializerConfig);
