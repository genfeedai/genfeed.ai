import type { ActionContractSchemas } from './action-contract.interface';
import {
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  enumSchema,
  JSON_DOCUMENT_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders';

/**
 * Video transfer only: one character image and one motion video. Trajectory,
 * camera and combined modes are not inputs, so the closed schema refuses them
 * before any run starts.
 */
const MOTION_CONTROL_INPUT = closedObjectSchema({
  brandId: STRING_SCHEMA,
  characterOrientation: enumSchema(['image', 'video'] as const),
  image: JSON_DOCUMENT_SCHEMA,
  keepOriginalSound: BOOLEAN_SCHEMA,
  model: STRING_SCHEMA,
  prompt: STRING_SCHEMA,
  qualityMode: enumSchema(['std', 'pro'] as const),
  video: JSON_DOCUMENT_SCHEMA,
});

const MOTION_CONTROL_OUTPUT = closedObjectSchema(
  {
    externalId: nullableSchema(STRING_SCHEMA),
    generationBriefEvidence: JSON_DOCUMENT_SCHEMA,
    generationSource: STRING_SCHEMA,
    id: STRING_SCHEMA,
    model: STRING_SCHEMA,
    provider: STRING_SCHEMA,
    status: STRING_SCHEMA,
    videoUrl: STRING_SCHEMA,
  },
  ['id', 'model', 'provider', 'status'],
);

export function getMotionControlActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return id === 'motionControl'
    ? { inputSchema: MOTION_CONTROL_INPUT, outputSchema: MOTION_CONTROL_OUTPUT }
    : undefined;
}
