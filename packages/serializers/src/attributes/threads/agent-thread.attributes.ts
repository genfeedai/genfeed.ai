import { createEntityAttributes } from '@genfeedai/helpers';

export const agentThreadAttributes = createEntityAttributes([
  'attentionState',
  'brandId',
  'contextVersion',
  'lastActivityAt',
  'lastAssistantPreview',
  'pendingInputCount',
  'runStatus',
  'organization',
  'user',
  'isPinned',
  'planModeEnabled',
  'requestedModel',
  'runtimeKey',
  'title',
  'source',
  'status',
]);
