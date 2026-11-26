import { buildSerializer } from '@serializers/builders';
import { libraryElementSerializerConfig } from '@serializers/configs';

export const { LibraryElementSerializer } = buildSerializer(
  'server',
  libraryElementSerializerConfig,
);
