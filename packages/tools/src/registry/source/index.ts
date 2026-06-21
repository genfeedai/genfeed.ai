import type { SourceTool } from '../../interfaces/source-tool.interface.js';
import { AGENT_ONLY_TOOLS } from './agent-only/index.js';
import { MCP_ONLY_TOOLS } from './mcp-only/index.js';
import { OVERLAP_TOOLS } from './overlap.tools.js';

export const SOURCE_TOOLS: SourceTool[] = [
  ...OVERLAP_TOOLS,
  ...AGENT_ONLY_TOOLS,
  ...MCP_ONLY_TOOLS,
];
