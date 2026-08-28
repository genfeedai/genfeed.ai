import type { SourceTool } from '../../interfaces/source-tool.interface.js';
import { AGENT_ONLY_TOOLS } from './agent-only/index.js';
import { BRAND_INTERVIEW_TOOLS } from './brand-interview.tools.js';
import { MCP_ONLY_TOOLS } from './mcp-only/index.js';
import { OVERLAP_TOOLS } from './overlap.tools.js';
import { OVERLAP_INSPIRATION_TOOLS } from './overlap-inspiration.tools.js';

/**
 * Hand-authored schemas and metadata for curated product actions. The shard
 * names preserve the historical file organization only; surface intent lives
 * exclusively in `curated-action-catalog.ts`.
 */
export const SOURCE_TOOLS: SourceTool[] = [
  ...OVERLAP_TOOLS,
  ...OVERLAP_INSPIRATION_TOOLS,
  ...AGENT_ONLY_TOOLS,
  ...MCP_ONLY_TOOLS,
  ...BRAND_INTERVIEW_TOOLS,
];
