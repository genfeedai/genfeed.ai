import {
  isAgentUntrustedContentSource,
  MCP_TOOL_RESULT_MAX_JSON_BYTES,
  readAgentUntrustedContentSource,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import type { McpAppResult } from '@mcp/shared/interfaces/mcp-app.interface';
import { withCardResult } from '@mcp/ui/card-data';
import * as Sentry from '@sentry/nestjs';

/**
 * An oversize result cannot be posted whole (the gate endpoint is capped at
 * `MCP_TOOL_RESULT_MAX_JSON_BYTES`), so the head and tail are sent as one
 * bounded sample flagged `isPartial`. The API owns the policy: in live mode it
 * withholds a result with an unclassified tail, in shadow mode it samples and
 * counts the gap. 15k + 15k characters plus the marker stay inside one
 * classifier window (32k characters).
 */
const OVERSIZE_SAMPLE_EDGE_CHARS = 15_000;
const OVERSIZE_SAMPLE_MARKER =
  '\n[... middle of oversize result omitted ...]\n';

function buildOversizeSample(content: string): string {
  return `${content.slice(0, OVERSIZE_SAMPLE_EDGE_CHARS)}${OVERSIZE_SAMPLE_MARKER}${content.slice(-OVERSIZE_SAMPLE_EDGE_CHARS)}`;
}

/**
 * The gate could not run, so the result passed unclassified. The endpoint's
 * mode is not known here, so this stays open but is counted (never just a
 * warning) so a broken adapter shows up on a dashboard.
 */
function reportAdapterFailOpen(
  logger: Pick<LoggerService, 'warn'>,
  toolName: string,
  contentLength: number,
): void {
  logger.warn('MCP result gate failed open', {
    toolName,
    category: 'adapter',
    contentLength,
  });
  try {
    Sentry.metrics.count('agent.untrusted_content_gate.fail_open', 1, {
      attributes: { category: 'adapter', origin: 'mcp' },
    });
  } catch {
    // Metrics are best-effort.
  }
}

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
      const isOversize = contentLength > MCP_TOOL_RESULT_MAX_JSON_BYTES;
      const gated = isOversize
        ? await client.evaluateMcpToolResult(
            name,
            buildOversizeSample(content),
            true,
          )
        : await client.evaluateMcpToolResult(name, content);
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
    } catch {
      reportAdapterFailOpen(logger, name, contentLength);
    }
  }
  return withCardResult(name, result);
}
