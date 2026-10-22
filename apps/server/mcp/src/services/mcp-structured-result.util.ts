import {
  getMcpToolResultFamily,
  MCP_RESULT_SCHEMAS,
  MCP_TOOL_OUTPUT_SCHEMA,
} from '@genfeedai/actions';
import type { CallToolResultSchema } from '@modelcontextprotocol/core';
import { z } from 'zod';

type McpCallResult = ReturnType<typeof CallToolResultSchema.parse>;

const outputValidator = z.fromJSONSchema(MCP_TOOL_OUTPUT_SCHEMA);
const familyValidators = {
  data: z.fromJSONSchema(MCP_RESULT_SCHEMAS.data),
  object: z.fromJSONSchema(MCP_RESULT_SCHEMAS.object),
  media: z.fromJSONSchema(MCP_RESULT_SCHEMAS.media),
  discovery: z.fromJSONSchema(MCP_RESULT_SCHEMAS.discovery),
};

/** Validate the envelope without rebuilding native content or widget metadata. */
export function withMcpStructuredContent(
  result: McpCallResult,
  tool?: Parameters<typeof getMcpToolResultFamily>[0],
): McpCallResult {
  const structuredContent =
    result.structuredContent === undefined
      ? {
          message: (result.content ?? [])
            .flatMap((block) => (block.type === 'text' ? [block.text] : []))
            .join('\n'),
        }
      : result.structuredContent;
  outputValidator.parse(structuredContent);
  if (tool)
    familyValidators[getMcpToolResultFamily(tool)].parse(structuredContent);
  return result.structuredContent === undefined
    ? { ...result, structuredContent }
    : result;
}
