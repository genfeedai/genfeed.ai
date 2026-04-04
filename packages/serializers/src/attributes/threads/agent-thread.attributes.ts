import { createEntityAttributes } from '@genfeedai/helpers';

export const agentThreadAttributes = createEntityAttributes([
  'attentionState',
  'lastActivityAt',
  'lastAssistantPreview',
  'pendingInputCount',
  'runStatus',
  'organization',
  'user',
  'isPinned',
  'planModeEnabled',
  'title',
  'source',
  'status',
]);
