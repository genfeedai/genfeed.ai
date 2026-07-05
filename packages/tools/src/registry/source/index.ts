import type { SourceTool } from '../../interfaces/source-tool.interface.js';
import { AGENT_ONLY_TOOLS } from './agent-only/index.js';
import { BRAND_INTERVIEW_TOOLS } from './brand-interview.tools.js';
import { MCP_ONLY_TOOLS } from './mcp-only/index.js';
import { OVERLAP_TOOLS } from './overlap.tools.js';

/**
 * Hand-curated tool inventory. OpenAPI-generated tools (#1246) are intentionally
 * NOT here — they merge in at the {@link ALL_TOOLS} assembly layer so this
 * curated set stays the canonical, reviewed source (guarded by
 * `source-tools.test.ts`).
 */
export const SOURCE_TOOLS: SourceTool[] = [
  ...OVERLAP_TOOLS,
  ...AGENT_ONLY_TOOLS,
  ...MCP_ONLY_TOOLS,
  ...BRAND_INTERVIEW_TOOLS,
];
