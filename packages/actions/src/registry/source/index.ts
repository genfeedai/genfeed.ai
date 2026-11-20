import type { SourceTool } from '../../interfaces/source-tool.interface';
import { MCP_CATALOG_TOOLS } from '../mcp-catalog/catalog';
import { composeMcpCatalogTool } from '../mcp-catalog/compose';
import { AGENT_ONLY_TOOLS } from './agent-only/index';
import { BRAND_FROM_URL_TOOLS } from './brand-from-url.tools';
import { BRAND_INTERVIEW_TOOLS } from './brand-interview.tools';
import { MCP_ONLY_TOOLS } from './mcp-only/index';
import { OVERLAP_TOOLS } from './overlap.tools';
import { OVERLAP_INSPIRATION_TOOLS } from './overlap-inspiration.tools';
import { VISUAL_CODE_TOOLS } from './visual-code.tools';

/**
 * Hand-authored schemas and metadata for curated product actions. The shard
 * names preserve the historical file organization only; surface intent lives
 * exclusively in `curated-actions.catalog.ts`.
 */
const AUTHORED_SOURCE_TOOLS: SourceTool[] = [
  ...VISUAL_CODE_TOOLS,
  ...OVERLAP_TOOLS,
  ...OVERLAP_INSPIRATION_TOOLS,
  ...AGENT_ONLY_TOOLS,
  ...MCP_ONLY_TOOLS,
  ...BRAND_INTERVIEW_TOOLS,
  ...BRAND_FROM_URL_TOOLS,
];

const AUTHORED_SOURCE_TOOLS_BY_NAME: ReadonlyMap<string, SourceTool> = new Map(
  AUTHORED_SOURCE_TOOLS.map((tool) => [tool.name, tool]),
);

/**
 * Authored tools plus the merged MCP tools composed from them. A merged tool
 * is declared once in `mcp-catalog/catalog.ts`, never authored here.
 */
export const SOURCE_TOOLS: SourceTool[] = [
  ...AUTHORED_SOURCE_TOOLS,
  ...MCP_CATALOG_TOOLS.map((spec) =>
    composeMcpCatalogTool(spec, AUTHORED_SOURCE_TOOLS_BY_NAME),
  ),
];
