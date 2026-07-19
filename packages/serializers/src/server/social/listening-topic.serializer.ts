import { buildSerializer } from '@serializers/builders';
import {
  listeningEvidenceSerializerConfig,
  listeningTopicSerializerConfig,
} from '@serializers/configs';

export const { ListeningTopicSerializer } = buildSerializer(
  'server',
  listeningTopicSerializerConfig,
);

export const { ListeningEvidenceSerializer } = buildSerializer(
  'server',
  listeningEvidenceSerializerConfig,
);
