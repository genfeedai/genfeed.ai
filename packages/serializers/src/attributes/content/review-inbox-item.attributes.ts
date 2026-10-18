// Inbox rows are projections over workflow executions and MCP approvals:
// approval arguments, raw node outputs and results never leave the server.
export const reviewInboxItemAttributes = [
  'kind',
  'source',
  'sourceLabel',
  'brandId',
  'brandLabel',
  'actionSummary',
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
];
