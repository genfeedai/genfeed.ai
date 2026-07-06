import type { SourceTool } from '../../../interfaces/source-tool.interface.js';
import { MCP_ADMIN_TOOLS } from './admin.tools.js';
import { MCP_ADS_TOOLS } from './ads.tools.js';
import { MCP_AGENT_CONTROL_TOOLS } from './agent-control.tools.js';
import { MCP_ANALYTICS_TOOLS } from './analytics.tools.js';
import { MCP_CAMPAIGN_TOOLS } from './campaign.tools.js';
import { MCP_CLIP_TOOLS } from './clips.tools.js';
import { MCP_CONTENT_TOOLS } from './content.tools.js';
import { MCP_GENERATION_TOOLS } from './generation.tools.js';
import { MCP_OTHER_TOOLS } from './other.tools.js';
import { MCP_SOCIAL_TOOLS } from './social.tools.js';
import { MCP_WORKFLOW_TOOLS } from './workflow.tools.js';

export const MCP_ONLY_TOOLS: SourceTool[] = [
  ...MCP_GENERATION_TOOLS,
  ...MCP_ANALYTICS_TOOLS,
  ...MCP_CONTENT_TOOLS,
  ...MCP_OTHER_TOOLS,
  ...MCP_WORKFLOW_TOOLS,
  ...MCP_SOCIAL_TOOLS,
  ...MCP_ADMIN_TOOLS,
  ...MCP_AGENT_CONTROL_TOOLS,
  ...MCP_ADS_TOOLS,
  ...MCP_CAMPAIGN_TOOLS,
  ...MCP_CLIP_TOOLS,
];
