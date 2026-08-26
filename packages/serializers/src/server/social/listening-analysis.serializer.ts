import { buildSerializer } from '@serializers/builders';
import {
  listeningSignalSerializerConfig,
  listeningThemeSerializerConfig,
} from '@serializers/configs';

export const { ListeningThemeSerializer } = buildSerializer(
  'server',
  listeningThemeSerializerConfig,
);

export const { ListeningSignalSerializer } = buildSerializer(
  'server',
  listeningSignalSerializerConfig,
);
