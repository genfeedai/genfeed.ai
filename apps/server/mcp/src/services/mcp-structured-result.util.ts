import { MCP_TOOL_OUTPUT_SCHEMA } from '@genfeedai/actions';
import type { CallToolResultSchema } from '@modelcontextprotocol/core';
import { z } from 'zod';

type McpCallResult = ReturnType<typeof CallToolResultSchema.parse>;

const outputValidator = z.fromJSONSchema(MCP_TOOL_OUTPUT_SCHEMA);

/** Validate the envelope without rebuilding native content or widget metadata. */
export function withMcpStructuredContent(result: McpCallResult): McpCallResult {
  const structuredContent =
    result.structuredContent === undefined
      ? {
          message: (result.content ?? [])
            .flatMap((block) => (block.type === 'text' ? [block.text] : []))
            .join('\n'),
        }
      : result.structuredContent;
  outputValidator.parse(structuredContent);
  return result.structuredContent === undefined
    ? { ...result, structuredContent }
    : result;
}
