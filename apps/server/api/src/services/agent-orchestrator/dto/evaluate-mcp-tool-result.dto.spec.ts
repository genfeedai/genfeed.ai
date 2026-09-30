import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { EvaluateMcpToolResultDto } from '@api/services/agent-orchestrator/dto/evaluate-mcp-tool-result.dto';
import { MCP_TOOL_RESULT_MAX_JSON_BYTES } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const pipe = new ValidationPipe();
const validateBody = (body: unknown) =>
  pipe.transform(body, { metatype: EvaluateMcpToolResultDto, type: 'body' });
describe('EvaluateMcpToolResultDto', () => {
  it('allows exactly the serialized JSON byte boundary', async () => {
    await expect(
      validateBody({ content: 'a'.repeat(MCP_TOOL_RESULT_MAX_JSON_BYTES - 2) }),
    ).resolves.toBeDefined();
    await expect(
      validateBody({ content: 'a'.repeat(MCP_TOOL_RESULT_MAX_JSON_BYTES - 1) }),
    ).rejects.toBeDefined();
  });
  it('counts UTF-8 and JSON escaping and rejects nonstrings and undeclared metadata', async () => {
    for (const body of [
      { content: 'é'.repeat(MCP_TOOL_RESULT_MAX_JSON_BYTES / 2) },
      { content: '\n'.repeat(MCP_TOOL_RESULT_MAX_JSON_BYTES / 2) },
      { content: 1 },
      {},
      { content: 'safe', threadId: 'spoofed' },
    ])
      await expect(validateBody(body)).rejects.toBeDefined();
  });
});
