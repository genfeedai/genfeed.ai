import { moodBoardAttributes } from '@serializers/attributes/content/mood-board.attributes';
import { simpleConfig } from '@serializers/builders';

export const moodBoardSerializerConfig = simpleConfig(
  'mood-board',
  moodBoardAttributes,
);
