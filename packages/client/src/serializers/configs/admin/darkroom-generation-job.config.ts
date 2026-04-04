import { darkroomGenerationJobAttributes } from '../../attributes/admin/darkroom-generation-job.attributes';
import { simpleConfig } from '../../builders';

export const darkroomGenerationJobSerializerConfig = simpleConfig(
  'darkroom-generation-job',
  darkroomGenerationJobAttributes,
);
