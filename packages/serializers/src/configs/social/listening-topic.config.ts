import {
  listeningEvidenceAttributes,
  listeningTopicAttributes,
} from '@serializers/attributes/social/listening-topic.attributes';
import { simpleConfig } from '@serializers/builders';

export const listeningTopicSerializerConfig = simpleConfig(
  'listening-topic',
  listeningTopicAttributes,
);

export const listeningEvidenceSerializerConfig = simpleConfig(
  'listening-evidence',
  listeningEvidenceAttributes,
);
