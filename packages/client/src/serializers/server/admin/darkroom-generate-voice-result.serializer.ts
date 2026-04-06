import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomGenerateVoiceResultSerializerConfig } from '../../configs';

export const DarkroomGenerateVoiceResultSerializer: BuiltSerializer =
  buildSingleSerializer('server', darkroomGenerateVoiceResultSerializerConfig);
