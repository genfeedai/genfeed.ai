export interface StructuredProgressDebugPayload {
  error?: string;
  parameters?: Record<string, unknown>;
  rawOutput?: string;
  result?: unknown;
}
