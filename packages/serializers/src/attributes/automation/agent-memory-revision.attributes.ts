import { createEntityAttributes } from '@genfeedai/helpers';

export const agentMemoryRevisionAttributes = createEntityAttributes([
  'actorUserId',
  'confidence',
  'content',
  'importance',
  'isCurrent',
  'kind',
  'memoryId',
  'provenance',
  'reason',
  'revision',
  'summary',
  'tags',
]);
