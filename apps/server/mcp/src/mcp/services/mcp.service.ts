import type { CanonicalToolDefinition, ToolCategory } from '@genfeedai/actions';
import { getToolsForRole } from '@genfeedai/actions';
import * as appMetadata from '@mcp/config/app-metadata.json';
import { MCP_RESOURCES } from '@mcp/mcp/resource-catalog';
import { getPublicMcpUrl } from '@mcp/mcp/setup-page';
import type {
  McpConfiguration,
  McpExample,
  McpExampleToolPreview,
} from '@mcp/shared/interfaces/mcp-config.interface';
import { Injectable } from '@nestjs/common';

/**
 * How many tools the public example samples. The full role-filtered catalog is
 * served by `GET /v1/tools`; this is documentation, not a substitute for it.
 */
const TOOL_PREVIEW_LIMIT = 8;

@Injectable()
export class MCPService {
  getMcpConfiguration(): McpConfiguration {
    const mcpUrl = getPublicMcpUrl();

    return {
      mcpServers: {
        genfeed: {
          headers: {
            Authorization: 'Bearer ${GENFEED_API_KEY}',
          },
          transport: 'streamable-http',
          type: 'http',
          url: mcpUrl,
        },
      },
    };
  }

  /**
   * Public setup example for `GET /v1/example`. Everything factual about the
   * server — description, version, resources, tool surface — is derived from a
   * canonical source (`app-metadata.json`, {@link MCP_RESOURCES},
   * `@genfeedai/actions`) rather than transcribed, so the endpoint cannot drift
   * into advertising tools the server does not serve.
   */
  getMcpExample(): McpExample {
    const mcpUrl = getPublicMcpUrl();
    // `user` is the least-privileged role: the public example must never reveal
    // admin-gated tool names to an unauthenticated reader.
    const publicTools = getToolsForRole('mcp', 'user');

    return {
      capabilities: {
        resources: {
          listChanged: true,
        },
        tools: {
          listChanged: true,
        },
      },
      description: appMetadata.description,
      installation: {
        clientExamples: {
          claudeCode: {
            command: `claude mcp add --transport http genfeed --scope user ${mcpUrl} --header "Authorization: Bearer $GENFEED_API_KEY"`,
          },
          codex: {
            command: `codex mcp add genfeed --url ${mcpUrl} --bearer-token-env-var GENFEED_API_KEY`,
            configToml: `[mcp_servers.genfeed]
url = "${mcpUrl}"
bearer_token_env_var = "GENFEED_API_KEY"`,
          },
          mcpServers: {
            genfeed: {
              env: {
                GENFEED_API_KEY: 'gf_live_xxx',
              },
              headers: {
                Authorization: 'Bearer ${GENFEED_API_KEY}',
              },
              transport: 'streamable-http',
              type: 'http',
              url: mcpUrl,
            },
          },
        },
        description: 'Connect the hosted Genfeed.ai MCP server',
        steps: [
          '1. Create a Genfeed API key in app settings',
          '2. Export GENFEED_API_KEY in your shell or client environment',
          '3. Add the hosted Streamable HTTP endpoint to Claude Code or Codex',
          '4. Verify the server with your client MCP list command',
        ],
      },
      name: 'Genfeed.ai MCP Server',
      resources: [...MCP_RESOURCES],
      tools: {
        endpoint: new URL('/v1/tools', mcpUrl).toString(),
        preview: MCPService.buildToolPreview(publicTools),
        total: publicTools.length,
      },
      version: appMetadata.version,
    };
  }

  /**
   * One representative tool per category, alphabetical, capped at
   * {@link TOOL_PREVIEW_LIMIT}. Deterministic so the public example is stable
   * between deploys, and category-spread so the sample shows the breadth of the
   * surface instead of whichever tools happen to sort first.
   */
  private static buildToolPreview(
    tools: CanonicalToolDefinition[],
  ): McpExampleToolPreview[] {
    const seenCategories = new Set<ToolCategory>();

    return [...tools]
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((tool) => {
        if (seenCategories.has(tool.category)) {
          return false;
        }
        seenCategories.add(tool.category);
        return true;
      })
      .slice(0, TOOL_PREVIEW_LIMIT)
      .map((tool) => ({
        category: tool.category,
        description: tool.description,
        name: tool.name,
      }));
  }
}
