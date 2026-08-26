import { buildSerializer } from '@serializers/builders';
import { listeningTopicOutcomeSerializerConfig } from '@serializers/configs';

export const { ListeningTopicOutcomeSerializer } = buildSerializer(
  'server',
  listeningTopicOutcomeSerializerConfig,
);
