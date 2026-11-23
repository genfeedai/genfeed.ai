/**
 * A tool call the caller wrote wrongly: an unknown action, a misplaced field, a
 * field combination the tool does not accept. The message tells the caller how
 * to repair the call. The MCP server answers it as a validation failure and
 * logs it as a warning, because the caller (an agent or a person's client)
 * made the mistake and the server did not fail.
 */
export class McpToolInputError extends Error {
  /** The argument at fault. */
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = 'McpToolInputError';
    this.field = field;
  }
}
