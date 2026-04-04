import { darkroomGenerationJobAttributes } from '@serializers/attributes/admin/darkroom-generation-job.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomGenerationJobSerializerConfig = simpleConfig(
  'darkroom-generation-job',
  darkroomGenerationJobAttributes,
);
