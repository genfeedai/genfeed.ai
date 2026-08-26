import { listeningTopicOutcomeAttributes } from '@serializers/attributes/social/listening-topic-outcome.attributes';
import { simpleConfig } from '@serializers/builders';

export const listeningTopicOutcomeSerializerConfig = simpleConfig(
  'listening-topic-outcome',
  listeningTopicOutcomeAttributes,
);
