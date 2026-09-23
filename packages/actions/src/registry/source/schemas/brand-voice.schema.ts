import {
  arraySchema,
  closedObjectSchema,
  enumSchema,
  STRING_SCHEMA,
} from '../../contracts/schema-builders';

const strings = arraySchema(STRING_SCHEMA);
export const BRAND_VOICE_PROFILE_SCHEMA = closedObjectSchema({
  approvedHooks: strings,
  audience: strings,
  bannedPhrases: strings,
  canonicalSource: enumSchema(['brand', 'founder', 'hybrid']),
  doNotSoundLike: strings,
  exemplarTexts: strings,
  hashtags: strings,
  messagingPillars: strings,
  prompting: closedObjectSchema({
    conversationStarters: arraySchema(
      closedObjectSchema({
        id: STRING_SCHEMA,
        intent: enumSchema(['analyze', 'create', 'plan']),
        label: STRING_SCHEMA,
        prompt: STRING_SCHEMA,
        topic: STRING_SCHEMA,
      }),
    ),
    seeds: arraySchema(
      closedObjectSchema({
        angle: STRING_SCHEMA,
        audience: STRING_SCHEMA,
        preferredFormats: strings,
        topic: STRING_SCHEMA,
      }),
    ),
  }),
  sampleOutput: STRING_SCHEMA,
  strategy: closedObjectSchema({ goals: strings, topics: strings }),
  style: STRING_SCHEMA,
  taglines: strings,
  tone: STRING_SCHEMA,
  values: strings,
  writingRules: strings,
});
