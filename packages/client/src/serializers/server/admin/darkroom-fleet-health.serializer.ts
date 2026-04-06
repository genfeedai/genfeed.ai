import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomFleetHealthSerializerConfig } from '../../configs';

export const DarkroomFleetHealthSerializer: BuiltSerializer =
  buildSingleSerializer('server', darkroomFleetHealthSerializerConfig);
