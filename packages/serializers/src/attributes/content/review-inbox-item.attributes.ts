// Inbox rows are projections over workflow executions, MCP approvals and agent
// questions: approval arguments, raw node outputs and results never leave the
// server. A question carries only what answering it needs.
export const reviewInboxItemAttributes = [
  'kind',
  'source',
  'sourceLabel',
  'brandId',
  'brandLabel',
  'brandLogoUrl',
  'actionSummary',
  'actionTitle',
  'actionDetails',
  'requestedByLabel',
  'preview',
  'requestedAt',
  'expiresAt',
  'status',
  'isResolvable',
  'reasons',
  'workflowId',
  'executionId',
  'nodeId',
  'approvalId',
  'toolName',
  'estimatedCredits',
  'batchCount',
  'question',
];
