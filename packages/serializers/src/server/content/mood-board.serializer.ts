import { buildSerializer } from '@serializers/builders';
import { moodBoardSerializerConfig } from '@serializers/configs';

export const { MoodBoardSerializer } = buildSerializer(
  'server',
  moodBoardSerializerConfig,
);
