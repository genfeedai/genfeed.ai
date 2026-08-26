import {
  listeningSignalAttributes,
  listeningThemeAttributes,
} from '@serializers/attributes/social/listening-analysis.attributes';
import { simpleConfig } from '@serializers/builders';

export const listeningThemeSerializerConfig = simpleConfig(
  'listening-theme',
  listeningThemeAttributes,
);

export const listeningSignalSerializerConfig = simpleConfig(
  'listening-signal',
  listeningSignalAttributes,
);
