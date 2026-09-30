import {
  isAgentUntrustedContentSource,
  MCP_TOOL_RESULT_MAX_JSON_BYTES,
  readAgentUntrustedContentSource,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import type { McpAppResult } from '@mcp/shared/interfaces/mcp-app.interface';
import { withCardResult } from '@mcp/ui/card-data';

export async function finalizeMcpToolResult<T extends McpAppResult>(
  name: string,
  result: T,
  isAgentExecutor: boolean,
  client: Pick<ClientService, 'evaluateMcpToolResult'>,
  logger: Pick<LoggerService, 'warn'>,
) {
  if (
    !isAgentExecutor &&
    isAgentUntrustedContentSource(readAgentUntrustedContentSource(name))
  ) {
    let contentLength = 0;
    try {
      const content = JSON.stringify(result);
      contentLength = Buffer.byteLength(JSON.stringify(content), 'utf8');
      if (contentLength > MCP_TOOL_RESULT_MAX_JSON_BYTES) {
        logger.warn('MCP result gate failed open', {
          toolName: name,
          category: 'oversize',
          contentLength,
        });
      } else {
        const gated = await client.evaluateMcpToolResult(name, content);
        if (gated.outcome === 'withheld') {
          // Do not card-wrap: resource/structured/card payloads must not survive.
          return {
            content: [
              {
                type: 'text' as const,
                text: 'tool result withheld: suspected instruction injection',
              },
            ],
            isError: true,
          };
        }
      }
    } catch {
      logger.warn('MCP result gate failed open', {
        toolName: name,
        category: 'adapter',
        contentLength,
      });
    }
  }
  return withCardResult(name, result);
}
