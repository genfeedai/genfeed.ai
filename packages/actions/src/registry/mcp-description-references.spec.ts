import { describe, expect, it } from 'vitest';
import { type McpToolOutput, toMcpTools } from '../adapters/to-mcp-tool';
import type {
  CanonicalToolDefinition,
  ToolRequiredRole,
} from '../interfaces/tool-definition.interface';
import { CLAUDE_MCP_TOOL_NAMES } from './mcp-access-modes';
import {
  ALL_TOOLS,
  getToolsForRole,
  getToolsForSurface,
} from './tool-registry';
import {
  DEFAULT_MCP_PROFILE_TOOLSETS,
  DIRECTORY_MCP_PROFILE_TOOLSETS,
} from './toolset-profiles';
import { getToolsForToolsets, TOOLSET_NAMES } from './toolsets';

interface DescribedTool {
  description?: string;
  name: string;
  inputSchema?: unknown;
}

function collectTexts(tool: DescribedTool): string[] {
  const texts = [tool.description ?? ''];
  const walk = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'description' && typeof child === 'string') texts.push(child);
      else walk(child);
    }
  };
  walk(tool.inputSchema);
  return texts;
}

/** Tools named in another tool's text that the same connection does not list. */
function danglingReferences(tools: readonly DescribedTool[]): string[] {
  // `generate` is also a plain verb ("what to generate"), so it cannot be
  // matched by name; its tool references are checked by review.
  const catalog = ALL_TOOLS.map((tool) => tool.name).filter(
    (name) => name !== 'generate',
  );
  const listed = new Set(tools.map((tool) => tool.name));
  return tools.flatMap((tool) =>
    catalog
      .filter((name) => name !== tool.name && !listed.has(name))
      .filter((name) =>
        collectTexts(tool).some((text) =>
          new RegExp(`(?<![\\w])${name}(?![\\w])`).test(text),
        ),
      )
      .map((name) => `${tool.name} mentions ${name}`),
  );
}

function projectedView(
  tools: CanonicalToolDefinition[],
  role: ToolRequiredRole,
): McpToolOutput[] {
  const allowed = new Set<string>(
    getToolsForRole('mcp', role).map((tool) => tool.name),
  );
  return toMcpTools(tools).filter((tool) => allowed.has(tool.name));
}

const VIEWS = [
  {
    name: 'default profile',
    tools: getToolsForToolsets('mcp', [...DEFAULT_MCP_PROFILE_TOOLSETS]),
  },
  {
    name: 'directory profile',
    tools: getToolsForToolsets('mcp', [...DIRECTORY_MCP_PROFILE_TOOLSETS]),
  },
  { name: 'full profile', tools: getToolsForSurface('mcp') },
  ...TOOLSET_NAMES.map((toolset) => ({
    name: `toolset ${toolset}`,
    tools: getToolsForToolsets('mcp', [toolset]),
  })),
];
const ROLES: ToolRequiredRole[] = ['user', 'admin', 'superadmin'];

describe('MCP tool descriptions only name tools on the same connection (#7177)', () => {
  describe.each(ROLES)('%s role', (role) => {
    it.each(VIEWS)('holds for the projected $name', ({ tools }) => {
      expect(danglingReferences(projectedView(tools, role))).toEqual([]);
    });

    it('holds for the projected Claude connector', () => {
      const tools = getToolsForSurface('mcp').filter((tool) =>
        CLAUDE_MCP_TOOL_NAMES.has(tool.name),
      );
      expect(danglingReferences(projectedView(tools, role))).toEqual([]);
    });
  });

  it('never states a client-specific limit as a fact about every client', () => {
    const offenders = toMcpTools(getToolsForSurface('mcp'))
      .filter((tool) => /\bthe Claude connector\b/i.test(tool.description))
      .map((tool) => tool.name);
    expect(offenders).toEqual([]);
  });
});
