// Status polling must never expose arguments, results or scope identifiers.
export const mcpApprovalStatusAttributes = [
  'status',
  'toolName',
  'createdAt',
  'resolvedAt',
];
