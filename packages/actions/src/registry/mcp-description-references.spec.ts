import { describe, expect, it } from 'vitest';
import { CLAUDE_MCP_TOOL_NAMES } from './mcp-access-modes';
import { getToolsForSurface } from './tool-registry';
import {
  DEFAULT_MCP_PROFILE_TOOLSETS,
  DIRECTORY_MCP_PROFILE_TOOLSETS,
} from './toolset-profiles';
import { getToolsForToolsets } from './toolsets';

interface DescribedTool {
  description?: string;
  name: string;
  parameters?: unknown;
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
  walk(tool.parameters);
  return texts;
}

/** Tools named in another tool's text that the same connection does not list. */
function danglingReferences(tools: readonly DescribedTool[]): string[] {
  // `generate` is also a plain verb ("what to generate"), so it cannot be
  // matched by name; its tool references are checked by review.
  const catalog = getToolsForSurface('mcp')
    .map((tool) => tool.name)
    .filter((name) => name !== 'generate');
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

describe('MCP tool descriptions only name tools on the same connection (#7177)', () => {
  it('holds for the bare URL (default profile)', () => {
    expect(
      danglingReferences(
        getToolsForToolsets('mcp', [...DEFAULT_MCP_PROFILE_TOOLSETS]),
      ),
    ).toEqual([]);
  });

  it('holds for the directory profile', () => {
    expect(
      danglingReferences(
        getToolsForToolsets('mcp', [...DIRECTORY_MCP_PROFILE_TOOLSETS]),
      ),
    ).toEqual([]);
  });

  it('holds for the Claude connector', () => {
    expect(
      danglingReferences(
        getToolsForSurface('mcp').filter((tool) =>
          CLAUDE_MCP_TOOL_NAMES.has(tool.name),
        ),
      ),
    ).toEqual([]);
  });

  it('never states a client-specific limit as a fact about every client', () => {
    const offenders = getToolsForSurface('mcp')
      .filter((tool) =>
        /\bthe Claude connector\b/i.test(tool.description ?? ''),
      )
      .map((tool) => tool.name);
    expect(offenders).toEqual([]);
  });
});
